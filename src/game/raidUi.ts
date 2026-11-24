import { ITEMS } from '../data/items';
import { TRAITS } from '../data/survivors';
import { DIRS, chebyshev, idx, manhattan } from '../sim/raid/grid';
import {
  adjacentContainers,
  adjacentLockedDoors,
  applyAction,
  canThrowAt,
  capacity,
  carriedWeight,
  computeVisible,
  crackPlan,
  createRaid,
  exitAt,
  exitBlocked,
  exitStatus,
  hasCrowbar,
  hasKey,
  hasTrait,
  lootValue,
} from '../sim/raid/raid';
import type { Action, RaidEvent, RaidState, Vec } from '../sim/raid/types';
import type { RaidTicket } from '../sim/shelter/types';
import { faceUrl } from './art';
import { iconize } from './icons';
import type { RaidScene } from './RaidScene';
import { sfx } from './sound';

/** Duração de um passo andando sem parar (igual à animação do boneco). */
const STEP_MS = 150;

/** Interface da incursão ativa: HUD lateral, teclado e tela de fim. */
export class RaidUi {
  private state: RaidState | null = null;
  private log: RaidEvent[] = [];
  private onDone: (actions: Action[]) => void = () => {};
  /** Modo de mira: o próximo clique no mapa arremessa uma pedra. */
  private throwing = false;
  private face: string | null = null;
  /** Andar contínuo: direcional seguro ou caminho até um ponto tocado. */
  private walk: { timer: number; dir?: Vec; goal?: Vec; toContainer?: boolean } | null = null;
  private lastStep = 0;

  constructor(
    private scene: RaidScene,
    private hud: HTMLElement,
    private overlay: HTMLElement,
    private top: HTMLElement,
    private ticker: HTMLElement,
  ) {
    scene.setTileClickHandler((p) => this.click(p));
    // Segurar o direcional anda sem parar, até soltar ou algo acontecer.
    hud.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-move]') as HTMLButtonElement | null;
      if (!b || !this.state) return;
      e.preventDefault();
      const [dx, dy] = b.dataset.move!.split(',').map(Number);
      this.startWalk({ dir: { x: dx, y: dy } });
    });
    const release = () => {
      if (this.walk?.dir) this.stopWalk();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    hud.addEventListener('click', (e) => {
      if (!this.state) return;
      if ((e.target as HTMLElement).closest('button[data-ui="throw"]')) return this.toggleThrow();
      const btn = (e.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null;
      if (!btn) return;
      this.act(JSON.parse(btn.dataset.action!) as Action);
      btn.blur();
    });
  }

  get active(): boolean {
    return this.state !== null;
  }

  /** Joga a incursão do ingresso; no fim entrega só o log de ações (o servidor confere). */
  begin(ticket: RaidTicket, onDone: (actions: Action[]) => void): void {
    this.onDone = onDone;
    this.throwing = false;
    const def = ticket.def;
    this.scene.setPlayer(def.id);
    this.face = faceUrl(def.id);
    const s = (this.state = createRaid(ticket.seed, def, ticket.opts));
    const roof = s.exits.find((e) => e.id === 'roof');
    this.log = s.emergency
      ? [
          { text: `${def.name} está encurralado(a) em ${s.site}. Os zumbis já ouviram o barulho.`, tone: 'bad' },
          { text: `Saia vivo(a). A escada do telhado abre no turno ${roof?.opensAt}.`, tone: 'warn' },
        ]
      : [
          { text: `${def.name} entra em ${s.site}.`, tone: 'info' },
          { text: `Ache suprimentos e volte. A escada do telhado abre no turno ${roof?.opensAt}.`, tone: 'info' },
          { text: `Tem algo trancado lá no fundo: ${s.containers.find((c) => c.locked)?.name ?? 'um cofre'}. A chave deve estar em algum móvel.`, tone: 'good' },
        ];
  }

  render(): void {
    if (!this.state) return;
    this.scene.draw(this.state);
    this.renderHud(this.state);
  }

  key(e: KeyboardEvent): void {
    const s = this.state;
    if (!s || s.status !== 'active' || !this.overlay.classList.contains('hidden')) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0],
    };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (moves[k]) {
      e.preventDefault();
      // Tecla segura repete rápido demais: um passo por animação.
      const now = performance.now();
      if (e.repeat && now - this.lastStep < STEP_MS) return;
      this.lastStep = now;
      this.stopWalk();
      this.act({ type: 'move', dx: moves[k][0], dy: moves[k][1] });
      return;
    }
    this.stopWalk();
    if (k === ' ') {
      e.preventDefault();
      this.act({ type: 'wait' });
    } else if (k === 'e') {
      const c = adjacentContainers(s).find((x) => !x.searched && (!x.locked || hasKey(s)));
      if (c) this.act({ type: 'search', containerId: c.id });
    } else if (k === 'c') {
      const c = adjacentContainers(s).find((x) => x.locked);
      if (c) this.act({ type: 'crack', containerId: c.id });
    } else if (k === 'x') {
      this.act({ type: 'extract' });
    } else if (k === 'p' || k === 'f') {
      const door = adjacentLockedDoors(s)[0];
      if (door) this.act({ type: k === 'p' ? 'pick' : 'force', x: door.x, y: door.y });
    } else if (k === 't') {
      this.toggleThrow();
    } else if (k === 'b') {
      const i = s.backpack.indexOf('bandage');
      if (i >= 0) this.act({ type: 'use', index: i });
    }
  }

  private toggleThrow(): void {
    const s = this.state;
    if (!s || s.status !== 'active') return;
    this.throwing = !this.throwing && s.rocks > 0;
    this.render();
  }

  private click(p: Vec): void {
    const s = this.state;
    if (!s || s.status !== 'active') return;
    this.stopWalk();
    if (this.throwing) {
      this.throwing = false;
      if (canThrowAt(s, p)) {
        this.act({ type: 'throw', x: p.x, y: p.y });
        return;
      }
      this.log.push({ text: 'Não dá para arremessar ali: longe demais, perto demais ou fora de vista.', tone: 'warn' });
      return this.render();
    }
    const c = s.containers.find((k) => k.pos.x === p.x && k.pos.y === p.y);
    if (c && chebyshev(c.pos, s.player) === 1) {
      if (!c.searched) this.act({ type: 'search', containerId: c.id });
      return;
    }
    if (manhattan(p, s.player) === 1) this.act({ type: 'move', dx: p.x - s.player.x, dy: p.y - s.player.y });
    else if (p.x === s.player.x && p.y === s.player.y) this.act({ type: 'wait' });
    // Longe: vai até lá sozinho, um turno por passo.
    else if (p.x >= 0 && p.y >= 0 && p.x < s.width && p.y < s.height && s.seen[idx(s, p.x, p.y)]) this.startWalk({ goal: p, toContainer: !!c });
  }

  private startWalk(w: { dir?: Vec; goal?: Vec; toContainer?: boolean }): void {
    this.stopWalk();
    const s = this.state;
    if (!s) return;
    const threat = this.threat(s);
    const tick = () => {
      const st = this.state;
      if (!st || st.status !== 'active' || !this.overlay.classList.contains('hidden')) return this.stopWalk();
      const step = w.dir ?? this.nextStepTo(st, w.goal!, !!w.toContainer);
      if (!step) return this.stopWalk();
      const before = st.turn;
      const events = this.act({ type: 'move', dx: step.x, dy: step.y });
      // Para quando algo acontece: susto, aviso, zumbi novo à vista, ou se não andou.
      if (st.turn === before || events.some((e) => e.tone === 'bad' || e.tone === 'warn') || this.threat(st) > threat) return this.stopWalk();
      if (w.goal && (w.toContainer ? chebyshev(w.goal, st.player) === 1 : st.player.x === w.goal.x && st.player.y === w.goal.y)) this.stopWalk();
    };
    this.walk = { ...w, timer: window.setInterval(tick, STEP_MS) };
    tick();
  }

  private stopWalk(): void {
    if (this.walk) window.clearInterval(this.walk.timer);
    this.walk = null;
  }

  /** Zumbis à vista (os que perseguem contam em dobro): se aumentar, o andar automático para. */
  private threat(s: RaidState): number {
    const vis = computeVisible(s);
    return s.zombies.reduce((n, z) => n + (vis[idx(s, z.pos.x, z.pos.y)] ? (z.state === 'chasing' ? 2 : 1) : 0), 0);
  }

  /** Próximo passo do caminho mais curto pelo que já foi visto (sem atravessar portas trancadas nem zumbis). */
  private nextStepTo(s: RaidState, goal: Vec, toContainer: boolean): Vec | null {
    const w = s.width;
    const dist = new Int32Array(w * s.height).fill(-1);
    const start = idx(s, goal.x, goal.y);
    dist[start] = 0;
    const queue = [start];
    const zombie = new Set(s.zombies.map((z) => idx(s, z.pos.x, z.pos.y)));
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      for (const d of DIRS) {
        const x = (cur % w) + d.x;
        const y = Math.floor(cur / w) + d.y;
        if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
        const i = idx(s, x, y);
        if (dist[i] !== -1 || !s.seen[i] || zombie.has(i)) continue;
        const t = s.tiles[i];
        if (t.kind === 'wall' || t.containerId !== undefined || (t.kind === 'door' && t.door === 'locked')) continue;
        if (t.kind === 'exit' && i !== start) continue;
        dist[i] = dist[cur] + 1;
        queue.push(i);
      }
    }
    if (toContainer && chebyshev(goal, s.player) === 1) return null;
    let best: Vec | null = null;
    let bestD = dist[idx(s, s.player.x, s.player.y)];
    if (bestD < 0) bestD = Infinity;
    for (const d of DIRS) {
      const x = s.player.x + d.x;
      const y = s.player.y + d.y;
      if (x < 0 || y < 0 || x >= w || y >= s.height) continue;
      const nd = dist[idx(s, x, y)];
      if (nd >= 0 && nd < bestD && !(toContainer && nd === 0)) {
        bestD = nd;
        best = d;
      }
    }
    return best;
  }

  private act(action: Action): RaidEvent[] {
    const s = this.state;
    if (!s || s.status !== 'active') return [];
    const events = applyAction(s, action);
    this.log.push(...events);
    // Som da ação: um golpe ou susto fala mais alto que o passo.
    if (events.some((e) => e.tone === 'bad')) sfx('hit');
    else if (action.type === 'move') sfx('step');
    else if (action.type === 'search' || action.type === 'take') sfx('search');
    else if (action.type === 'extract') sfx('good');
    this.render();
    if (s.status !== 'active') {
      this.stopWalk();
      setTimeout(() => this.showEnd(), 700);
    }
    return events;
  }

  private showEnd(): void {
    const s = this.state;
    if (!s) return;
    const escaped = s.status === 'extracted';
    const wounds = s.survivor.maxHp - s.survivor.hp;
    const items = s.backpack.map((it) => `${ITEMS[it].icon} ${ITEMS[it].name}`).join(', ') || 'nada';
    this.overlay.innerHTML = `
      <div class="modal">
        <h2 class="${escaped ? 'good' : 'bad'}">${escaped ? `${s.survivor.name} voltou para o abrigo` : `${s.survivor.name} não voltou`}</h2>
        <p>${
          escaped
            ? `Trouxe: ${items}.<br/>Valor: <strong>${lootValue(s.backpack)}</strong> · Ferimentos: <strong class="${wounds ? 'warn' : ''}">${wounds}</strong> · Turnos: ${s.turn} · Zumbis abatidos: ${s.kills}`
            : `Ficou em ${s.site}, junto com ${items}. Turnos: ${s.turn} · Zumbis abatidos: ${s.kills}.<br/>Essa perda é permanente.`
        }</p>
        <div class="actions"><button class="primary" id="raid-done">Voltar ao abrigo</button></div>
        <p style="font-size:11px">Semente ${s.seed} · ${s.log.length} ações registradas.</p>
      </div>`;
    iconize(this.overlay);
    this.overlay.classList.remove('hidden');
    document.getElementById('raid-done')!.addEventListener('click', () => {
      this.state = null;
      this.overlay.classList.add('hidden');
      this.onDone([...s.log]);
    });
  }

  private renderHud(s: RaidState): void {
    const sv = s.survivor;
    const hearts = '♥'.repeat(sv.hp) + '<span class="muted">' + '♡'.repeat(sv.maxHp - sv.hp) + '</span>';
    const weight = carriedWeight(s);
    const cap = capacity(s);
    const nextWave = Math.max(0, s.nextSpawnTurn - s.turn);
    const vis = computeVisible(s);
    const seenZombies = s.zombies.filter((z) => vis[idx(s, z.pos.x, z.pos.y)]).length;

    const exits = s.exits
      .map((e) => {
        const st = exitStatus(s, e.id);
        const tight = e.maxWeight !== undefined;
        const label = tight
          ? `<span class="${weight <= e.maxWeight! ? 'good' : 'warn'}">só com até ${e.maxWeight} kg</span>`
          : st === 'open'
            ? `<span class="good">aberta${e.closesAt !== null ? ` até o turno ${e.closesAt}` : ''}</span>`
            : st === 'soon'
              ? `<span class="warn">abre no turno ${e.opensAt}</span>`
              : '<span class="bad">perdida</span>';
        return `<div class="row"><span>${e.name}</span>${label}</div>`;
      })
      .join('');

    const key = (k: string) => `<kbd>${k}</kbd>`;
    const actions: string[] = [btn(`Esperar ${key('Espaço')}`, { type: 'wait' }, 'kb-only')];
    actions.push(
      `<button data-ui="throw" class="${this.throwing ? 'primary' : ''}" ${s.rocks > 0 ? '' : 'disabled'} title="Faz barulho longe de você: zumbis vão investigar">${this.throwing ? 'Clique onde jogar…' : `🪨 Arremessar pedra ${key('T')} · ${s.rocks}`}</button>`,
    );
    const here = exitAt(s, s.player);
    if (here && !exitBlocked(s, here.id)) actions.unshift(btn(`Extrair pela ${here.name.toLowerCase()} ${key('X')}`, { type: 'extract' }, 'primary'));
    else if (here && here.maxWeight !== undefined) actions.unshift(`<span class="warn small">Mochila pesada demais para a janela: largue até ficar com ${here.maxWeight} kg.</span>`);
    for (const d of adjacentLockedDoors(s)) {
      actions.push(btn(`Abrir fechadura ${key('P')} · ${hasTrait(s, 'mecanico') ? '1' : '3'} turnos`, { type: 'pick', x: d.x, y: d.y }));
      actions.push(btn(`Forçar porta ${key('F')} · ${hasCrowbar(s) ? 'barulho' : 'MUITO barulho'}`, { type: 'force', x: d.x, y: d.y }));
    }
    const bandage = s.backpack.indexOf('bandage');
    if (bandage >= 0 && sv.hp < sv.maxHp) actions.push(btn(`Curativo ${key('B')}`, { type: 'use', index: bandage }));

    const near = adjacentContainers(s);
    const containers = near.length
      ? near
          .map((c) => {
            if (c.locked) {
              const plan = crackPlan(s);
              return `<div class="row"><span>🔒 ${c.name}</span></div><div class="actions">${
                hasKey(s) ? btn(`🗝️ Abrir com a chave ${key('E')}`, { type: 'search', containerId: c.id }, 'primary') : '<span class="muted small">Trancado. A chave está em algum móvel do prédio.</span>'
              }${plan ? btn(`Arrombar ${key('C')} · ${plan.turns} turnos · ${plan.noise > 2 ? 'barulho alto' : 'quieto'}`, { type: 'crack', containerId: c.id }) : ''}</div>`;
            }
            if (!c.searched) {
              return `<div class="row"><span>${c.name}</span>${btn(`Procurar ${key('E')} · 2 turnos`, { type: 'search', containerId: c.id })}</div>`;
            }
            const items = c.items.length
              ? c.items
                  .map((it, i) => {
                    const fits = weight + ITEMS[it].weight <= cap;
                    return `<div class="row"><span>${ITEMS[it].icon} ${ITEMS[it].name} <span class="muted">${ITEMS[it].weight}kg</span></span>${fits ? btn('Pegar', { type: 'take', containerId: c.id, index: i }) : '<span class="muted">pesado</span>'}</div>`;
                  })
                  .join('')
              : '<div class="row muted">vazio</div>';
            return `<div class="row"><strong>${c.name}</strong></div>${items}`;
          })
          .join('')
      : '<div class="muted small">Nada por perto. Containers com ponto amarelo ainda não foram vasculhados.</div>';

    const pack = s.backpack.length
      ? s.backpack.map((it, i) => `<div class="row"><span>${ITEMS[it].icon} ${ITEMS[it].name}</span>${btn('Largar', { type: 'drop', index: i })}</div>`).join('')
      : '<div class="muted small">Vazia.</div>';

    // O essencial fica na barra de cima, colada no jogo; o painel guarda o que se toca.
    this.top.innerHTML = `<div class="tb-main">
        <span class="tb-clock">${this.face ? `<img class="face" src="${this.face}" alt=""/>` : ''}${sv.name} <span class="bad">${hearts}</span></span>
        <span class="tb-tags"><span title="Turno">⏱️ ${s.turn}</span>
          <span title="Zumbis à vista" class="${seenZombies ? 'warn' : ''}">🧟 ${seenZombies}</span>
          <span title="Turnos até a próxima leva da horda" class="${nextWave <= 2 ? 'bad' : ''}">📣 ${nextWave}</span>
          <span title="Peso da mochila" class="${weight >= cap ? 'bad' : ''}">🎒 ${weight}/${cap}</span></span>
      </div>`;
    const last = this.log[this.log.length - 1];
    this.ticker.innerHTML = last ? `<div class="${last.tone === 'info' ? '' : last.tone}">› ${last.text}</div>` : '';
    const dir = (label: string, dx: number, dy: number, area: string) => `<button class="pad-${area}" data-move="${dx},${dy}" aria-label="Mover">${label}</button>`;
    const pad = `<div class="dpad">
        ${dir('▲', 0, -1, 'up')}${dir('◀', -1, 0, 'left')}
        <button class="pad-wait" data-action='${JSON.stringify({ type: 'wait' })}' aria-label="Esperar">⏸</button>
        ${dir('▶', 1, 0, 'right')}${dir('▼', 0, 1, 'down')}
      </div>`;

    this.hud.innerHTML = `<div class="hud-body">
      <div class="card"><h3>Ações</h3><div class="raid-controls">${pad}<div class="actions">${actions.join('')}</div></div></div>
      <div class="card"><h3>Por perto</h3>${containers}</div>
      <div class="card"><h3>Saídas</h3>${exits}
        <div class="chips">${sv.traits.map((t) => `<span class="chip ${TRAITS[t].negative ? 'neg' : ''}" title="${TRAITS[t].description}">${TRAITS[t].name}</span>`).join('')}</div>
      </div>
      <div class="card">
        <h3>Mochila · ${weight}/${cap} kg · valor ${lootValue(s.backpack)}</h3>
        <div class="bar ${weight >= cap ? 'full' : ''}"><div style="width:${Math.min(100, (weight / cap) * 100)}%"></div></div>
        ${pack}
      </div>
      <div class="card"><h3>Diário</h3><div class="log">${this.log
        .slice(-30)
        .map((e) => `<div class="${e.tone === 'info' ? '' : e.tone}">› ${e.text}</div>`)
        .join('')}</div></div>
    </div>`;
    for (const el of [this.top, this.ticker, this.hud]) iconize(el);
  }
}

function btn(label: string, action: Action, cls = ''): string {
  return `<button class="${cls}" data-action='${JSON.stringify(action)}'>${label}</button>`;
}

import { ITEMS } from '../data/items';
import { TRAITS } from '../data/survivors';
import { chebyshev, idx, manhattan } from '../sim/raid/grid';
import {
  adjacentContainers,
  adjacentLockedDoors,
  applyAction,
  capacity,
  carriedWeight,
  computeVisible,
  createRaid,
  exitAt,
  exitStatus,
  hasCrowbar,
  hasTrait,
  lootValue,
} from '../sim/raid/raid';
import type { Action, RaidEvent, RaidState, Vec } from '../sim/raid/types';
import type { RaidTicket } from '../sim/shelter/types';
import type { RaidScene } from './RaidScene';

/** Interface da incursão ativa: HUD lateral, teclado e tela de fim. */
export class RaidUi {
  private state: RaidState | null = null;
  private log: RaidEvent[] = [];
  private onDone: (actions: Action[]) => void = () => {};

  constructor(
    private scene: RaidScene,
    private hud: HTMLElement,
    private overlay: HTMLElement,
  ) {
    scene.setTileClickHandler((p) => this.click(p));
    hud.addEventListener('click', (e) => {
      if (!this.state) return;
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
    const def = ticket.def;
    const s = (this.state = createRaid(ticket.seed, def, ticket.opts));
    const roof = s.exits.find((e) => e.id === 'roof');
    this.log = s.emergency
      ? [
          { text: `${def.name} está encurralado(a) em ${s.site}. Os mortos já sabem que tem alguém aqui.`, tone: 'bad' },
          { text: `Saia vivo(a). A escada do telhado abre no turno ${roof?.opensAt}.`, tone: 'warn' },
        ]
      : [
          { text: `${def.name} entra em ${s.site}. Silêncio… por enquanto.`, tone: 'info' },
          { text: `Ache suprimentos e volte. A escada do telhado abre no turno ${roof?.opensAt}.`, tone: 'info' },
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
      this.act({ type: 'move', dx: moves[k][0], dy: moves[k][1] });
    } else if (k === ' ') {
      e.preventDefault();
      this.act({ type: 'wait' });
    } else if (k === 'e') {
      const c = adjacentContainers(s).find((x) => !x.searched);
      if (c) this.act({ type: 'search', containerId: c.id });
    } else if (k === 'x') {
      this.act({ type: 'extract' });
    } else if (k === 'p' || k === 'f') {
      const door = adjacentLockedDoors(s)[0];
      if (door) this.act({ type: k === 'p' ? 'pick' : 'force', x: door.x, y: door.y });
    } else if (k === 'b') {
      const i = s.backpack.indexOf('bandage');
      if (i >= 0) this.act({ type: 'use', index: i });
    }
  }

  private click(p: Vec): void {
    const s = this.state;
    if (!s || s.status !== 'active') return;
    const c = s.containers.find((k) => k.pos.x === p.x && k.pos.y === p.y);
    if (c && chebyshev(c.pos, s.player) === 1 && !c.searched) return this.act({ type: 'search', containerId: c.id });
    if (manhattan(p, s.player) === 1) this.act({ type: 'move', dx: p.x - s.player.x, dy: p.y - s.player.y });
    else if (p.x === s.player.x && p.y === s.player.y) this.act({ type: 'wait' });
  }

  private act(action: Action): void {
    const s = this.state;
    if (!s || s.status !== 'active') return;
    this.log.push(...applyAction(s, action));
    this.render();
    if (s.status !== 'active') setTimeout(() => this.showEnd(), 700);
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
        const label =
          st === 'open'
            ? `<span class="good">aberta${e.closesAt !== null ? ` até o turno ${e.closesAt}` : ''}</span>`
            : st === 'soon'
              ? `<span class="warn">abre no turno ${e.opensAt}</span>`
              : '<span class="bad">perdida</span>';
        return `<div class="row"><span>${e.name}</span>${label}</div>`;
      })
      .join('');

    const actions: string[] = [btn('Esperar [Espaço]', { type: 'wait' })];
    const here = exitAt(s, s.player);
    if (here && exitStatus(s, here.id) === 'open') actions.unshift(btn(`Extrair pela ${here.name.toLowerCase()} [X]`, { type: 'extract' }, 'primary'));
    for (const d of adjacentLockedDoors(s)) {
      actions.push(btn(`Abrir fechadura [P] · ${hasTrait(s, 'mecanico') ? '1' : '3'} turnos`, { type: 'pick', x: d.x, y: d.y }));
      actions.push(btn(`Forçar porta [F] · ${hasCrowbar(s) ? 'barulho' : 'MUITO barulho'}`, { type: 'force', x: d.x, y: d.y }));
    }
    const bandage = s.backpack.indexOf('bandage');
    if (bandage >= 0 && sv.hp < sv.maxHp) actions.push(btn('Curativo [B]', { type: 'use', index: bandage }));

    const near = adjacentContainers(s);
    const containers = near.length
      ? near
          .map((c) => {
            if (!c.searched) {
              return `<div class="row"><span>${c.name}</span>${btn('Procurar [E] · 2 turnos', { type: 'search', containerId: c.id })}</div>`;
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

    this.hud.innerHTML = `
      <div class="card">
        <div class="row"><span class="name">${sv.name}</span><span class="bad" style="font-size:18px">${hearts}</span></div>
        <div class="chips">${sv.traits.map((t) => `<span class="chip ${TRAITS[t].negative ? 'neg' : ''}" title="${TRAITS[t].description}">${TRAITS[t].name}</span>`).join('')}</div>
      </div>
      <div class="card">
        <div class="row"><span>Turno</span><strong>${s.turn}</strong></div>
        <div class="row"><span>Zumbis à vista</span><strong>${seenZombies}</strong></div>
        <div class="row"><span>Próxima leva da horda</span><strong class="${nextWave <= 2 ? 'bad' : ''}">${nextWave} turnos</strong></div>
        ${exits}
      </div>
      <div class="card"><h3>Ações</h3><div class="actions">${actions.join('')}</div></div>
      <div class="card"><h3>Por perto</h3>${containers}</div>
      <div class="card">
        <h3>Mochila · ${weight}/${cap} kg · valor ${lootValue(s.backpack)}</h3>
        <div class="bar ${weight >= cap ? 'full' : ''}"><div style="width:${Math.min(100, (weight / cap) * 100)}%"></div></div>
        ${pack}
      </div>
      <div class="card"><h3>Diário</h3><div class="log">${this.log
        .slice(-30)
        .map((e) => `<div class="${e.tone === 'info' ? '' : e.tone}">› ${e.text}</div>`)
        .join('')}</div></div>
    `;
  }
}

function btn(label: string, action: Action, cls = ''): string {
  return `<button class="${cls}" data-action='${JSON.stringify(action)}'>${label}</button>`;
}

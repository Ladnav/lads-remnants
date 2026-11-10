import { ITEMS } from '../data/items';
import { banner, placeUrl } from './art';
import { iconize } from './icons';
import { LOCATIONS, RECIPES, RESOURCES, RISK_RULES, TASKS, locationById, type RecipeId, type ResourceId, type RiskRule, type TaskId } from '../data/shelter';
import { TRAITS } from '../data/survivors';
import type { Account } from '../net/backend';
import type { ShelterCommand } from '../server/game';
import { FRIEND, RIVAL, aliveSurvivors, bondOf, canAfford, dayOf, describeCost, emotionOf, friendsOf, hourOfDay, isNight, rivalsOf } from '../sim/shelter/core';
import { pendingEmergencies } from '../sim/shelter/expeditions';
import { SIGNAL_HOURS, evacuationNeeds, goalStage, hasUndiscovered, workEfficiency } from '../sim/shelter/shelter';
import type { DiaryEntry, Emotion, ShelterState, ShelterSurvivor } from '../sim/shelter/types';

export type View = 'shelter' | 'map';
/** Abas do painel. Abrigo e Bancada mostram o abrigo; Mapa mostra a região; Diário não troca a cena. */
export type Tab = 'home' | 'bench' | 'map' | 'log';

export interface HudEls {
  hud: HTMLElement;
  /** Barra de status acima do jogo: relógio e recursos, sempre à vista. */
  top: HTMLElement;
  /** Última linha do diário, logo abaixo do jogo. */
  ticker: HTMLElement;
}

type Cmd =
  | { cmd: 'tab'; tab: Tab }
  | { cmd: 'task'; id: string; task: TaskId }
  | { cmd: 'talk'; id: string }
  | { cmd: 'profile'; id: string }
  | { cmd: 'planRaid'; id: string }
  | { cmd: 'raid' }
  | { cmd: 'takeOver'; expId: number }
  | { cmd: 'delegate'; expId: number }
  | { cmd: 'build'; recipe: RecipeId }
  | { cmd: 'cancelBuild' }
  | { cmd: 'dilemma'; id: number; option: string }
  | { cmd: 'send' }
  | { cmd: 'cancelExp'; id: number }
  | { cmd: 'ration'; on: boolean }
  | { cmd: 'standing'; on: boolean }
  | { cmd: 'queue'; recipe: RecipeId }
  | { cmd: 'unqueue'; index: number }
  | { cmd: 'evacuate' }
  | { cmd: 'skip'; hours: number }
  | { cmd: 'link' };

export interface ShelterUiHooks {
  changed: () => void;
  /** Manda um comando ao backend; devolve o aviso de regra, se houver. */
  command: (cmd: ShelterCommand) => Promise<string | null>;
  setView: (v: View) => void;
  startRaid: (survivorId: string, locationId: string, loadout: { weapon: boolean; bandages: number }) => void;
  takeOver: (expId: number) => void;
  skip: (hours: number) => void;
  account: () => Account;
  linkEmail: (email: string) => Promise<string>;
  /** Retrato do sobrevivente: a pintura, ou o sprite para quem não tem. */
  portrait: (id: string) => string | null;
  /** Abre a ficha do personagem. */
  profile: (id: string) => void;
}

const EMOTION_LABEL: Record<Emotion, string> = { ok: 'bem', triste: 'triste', deprimido: 'deprimido(a)', quebrado: 'quebrado(a)' };
const EMOTION_CLASS: Record<Emotion, string> = { ok: 'good', triste: 'warn', deprimido: 'bad', quebrado: 'bad' };
export const SHOWN_RESOURCES: ResourceId[] = ['water', 'dirtyWater', 'food', 'meds', 'bandages', 'wood', 'scrap', 'parts', 'components', 'fuel', 'ammo', 'weapons', 'waste'];

export function clock(hour: number): string {
  return `Dia ${dayOf(hour)} · ${String(hourOfDay(hour)).padStart(2, '0')}:00`;
}

/** HUD do abrigo e do mapa. Guarda só rascunhos de formulário; o resto vem do estado. */
export class ShelterUi {
  private state: ShelterState | null = null;
  view: View = 'shelter';
  tab: Tab = 'home';
  selected = 'market';
  private hud: HTMLElement;
  private nav: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private shownTab: Tab | null = null;
  private exp = { ids: new Set<string>(), risk: 'balanced' as RiskRule };
  private raidWho: string | null = null;
  private loadout = { weapon: false, bandages: 0 };
  private error = '';
  private notice = '';

  constructor(
    private els: HudEls,
    private hooks: ShelterUiHooks,
  ) {
    const hud = (this.hud = els.hud);
    hud.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-cmd]') as HTMLElement | null;
      if (!el || !this.state || el.tagName === 'SELECT') return;
      this.run(JSON.parse(el.dataset.cmd!) as Cmd);
    });
    hud.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (!this.state) return;
      if (el.dataset.task) this.run({ cmd: 'task', id: el.dataset.task, task: el.value as TaskId });
      else if (el.name === 'exp-risk') this.exp.risk = el.value as RiskRule;
      else if (el.name === 'raid-who') this.raidWho = el.value;
      else if (el.name === 'raid-weapon') this.loadout.weapon = (el as HTMLInputElement).checked;
      else if (el.name === 'raid-bandages') this.loadout.bandages = Number(el.value);
      else if (el.name === 'exp-who') {
        const box = el as HTMLInputElement;
        if (box.checked) this.exp.ids.add(box.value);
        else this.exp.ids.delete(box.value);
      }
    });
  }

  attach(s: ShelterState): void {
    this.state = s;
  }

  detach(): void {
    this.state = null;
  }

  setError(msg: string): void {
    this.error = msg;
  }

  select(locationId: string): void {
    this.selected = locationId;
    this.error = '';
    this.hooks.changed();
  }

  private run(c: Cmd): void {
    const s = this.state!;
    this.error = '';
    const send = (cmd: ShelterCommand) => {
      void this.hooks.command(cmd).then((err) => {
        this.error = err ?? '';
        if (!err && cmd.type === 'send') this.exp.ids.clear();
        this.hooks.changed();
      });
    };
    switch (c.cmd) {
      case 'tab':
        this.openTab(c.tab);
        return;
      case 'planRaid':
        this.raidWho = c.id;
        this.openTab('map');
        return;
      case 'raid': {
        const who = this.availableForRaid(s).find((v) => v.id === this.raidWho) ?? this.availableForRaid(s)[0];
        if (!who) {
          this.error = 'Ninguém disponível para entrar agora.';
          this.hooks.changed();
          return;
        }
        this.hooks.startRaid(who.id, this.selected, {
          weapon: this.loadout.weapon && s.resources.weapons >= 1,
          bandages: Math.min(this.loadout.bandages, Math.floor(s.resources.bandages)),
        });
        this.loadout = { weapon: false, bandages: 0 };
        return;
      }
      case 'takeOver': this.hooks.takeOver(c.expId); return;
      case 'profile': this.hooks.profile(c.id); return;
      case 'skip': this.hooks.skip(c.hours); return;
      case 'link': {
        const input = this.hud.querySelector<HTMLInputElement>('input[name=email]');
        const email = input?.value.trim() ?? '';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          this.notice = 'Digite um e-mail válido.';
          this.hooks.changed();
          return;
        }
        void this.hooks.linkEmail(email).then((msg) => {
          this.notice = msg;
          this.hooks.changed();
        });
        return;
      }
      case 'task': return send({ type: 'task', id: c.id, task: c.task });
      case 'talk': return send({ type: 'talk', id: c.id });
      case 'delegate': return send({ type: 'delegate', expId: c.expId });
      case 'build': return send({ type: 'build', recipe: c.recipe });
      case 'cancelBuild': return send({ type: 'cancelBuild' });
      case 'dilemma': return send({ type: 'dilemma', id: c.id, option: c.option });
      case 'send': return send({ type: 'send', locationId: this.selected, ids: [...this.exp.ids], risk: this.exp.risk });
      case 'cancelExp': return send({ type: 'cancelExp', id: c.id });
      case 'ration': return send({ type: 'ration', on: c.on });
      case 'standing':
        return send({ type: 'standing', order: c.on ? { locationId: this.selected, ids: [...this.exp.ids], risk: this.exp.risk } : null });
      case 'queue': return send({ type: 'queue', recipe: c.recipe });
      case 'unqueue': return send({ type: 'unqueue', index: c.index });
      case 'evacuate': return send({ type: 'evacuate' });
    }
  }

  private openTab(tab: Tab): void {
    this.tab = tab;
    if (tab !== 'log') this.view = tab === 'map' ? 'map' : 'shelter';
    this.hooks.setView(this.view);
  }

  private availableForRaid(s: ShelterState): ShelterSurvivor[] {
    return s.survivors.filter((v) => v.status === 'home' && v.expeditionId === null && v.raidDay !== dayOf(s.hour));
  }

  render(): void {
    const s = this.state;
    if (!s) return;
    // A incursão escreve no mesmo painel; na volta, a estrutura é refeita.
    if (!this.body?.isConnected) {
      this.hud.innerHTML = '<nav class="tabs"></nav><div class="hud-body"></div>';
      this.nav = this.hud.querySelector('.tabs');
      this.body = this.hud.querySelector('.hud-body');
      this.shownTab = null;
    }
    const body = this.body!;
    const content =
      this.tab === 'map' ? this.mapView(s) : this.tab === 'bench' ? this.benchView(s) : this.tab === 'log' ? this.logView(s) : this.shelterView(s);
    // Redesenhar não pode jogar a rolagem para o topo nem apagar o que está sendo digitado.
    const sameTab = this.shownTab === this.tab;
    const scroll = body.scrollTop;
    const page = window.scrollY;
    const typed = body.querySelector<HTMLInputElement>('input[name=email]')?.value;
    this.els.top.innerHTML = this.topbar(s);
    this.nav!.innerHTML = this.tabs(s);
    body.innerHTML = `
      ${this.emergencies(s)}
      ${this.dilemmas(s)}
      ${this.error ? `<div class="card bad small">${this.error}</div>` : ''}
      ${content}`;
    const input = body.querySelector<HTMLInputElement>('input[name=email]');
    if (input && typed) input.value = typed;
    body.scrollTop = sameTab ? scroll : 0;
    if (sameTab && window.scrollY !== page) window.scrollTo(0, page);
    // No celular a página é que rola: trocar de aba volta para o começo dela.
    if (!sameTab && this.shownTab !== null) window.scrollTo(0, 0);
    this.shownTab = this.tab;
    const last = s.diary[s.diary.length - 1];
    this.els.ticker.innerHTML = last ? diaryHtml([last]) : '';
    for (const el of [this.els.top, this.nav!, body, this.els.ticker]) iconize(el);
  }

  private tabs(s: ShelterState): string {
    const alerts = pendingEmergencies(s).length;
    const def = s.project ? RECIPES[s.project.recipe] : null;
    const tab = (id: Tab, icon: string, label: string, badge = '') =>
      `<button class="tab ${this.tab === id ? 'active' : ''}" data-cmd='${JSON.stringify({ cmd: 'tab', tab: id })}'><span class="tab-icon">${icon}</span><span class="tab-label">${label}</span>${badge ? `<span class="tab-badge">${badge}</span>` : ''}</button>`;
    return (
      tab('home', '🏠', 'Abrigo', s.dilemmas.length ? '🚪' : '') +
      tab('bench', '🔨', 'Bancada', def ? `${Math.floor((s.project!.progress / def.hours) * 100)}%` : '') +
      tab('map', '🗺️', 'Mapa', alerts ? '🚨' : '') +
      tab('log', '📖', 'Diário')
    );
  }

  /** Relógio, gente e recursos: o que precisa estar à vista em qualquer aba. */
  private topbar(s: ShelterState): string {
    const night = isNight(hourOfDay(s.hour));
    const acc = this.hooks.account();
    const alive = aliveSurvivors(s);
    const home = alive.filter((v) => v.status === 'home').length;
    const resources = SHOWN_RESOURCES.map((r) => {
      const v = s.resources[r];
      const low = (r === 'water' || r === 'food') && v < alive.length;
      const bad = r === 'waste' && v > 8;
      return `<span class="res ${low || bad ? 'bad' : ''}" title="${RESOURCES[r].name}">${RESOURCES[r].icon} ${fmt(v)}</span>`;
    }).join('');
    return `<div class="tb-main">
        <span class="tb-clock">${night ? '🌙' : '☀️'} ${clock(s.hour)}</span>
        <span class="tb-tags">${s.raining ? '<span title="Chovendo: o coletor enche">🌧️</span>' : ''}
          <span title="Em casa / vivos">👥 ${home}/${alive.length}</span>
          ${s.rationing ? '<span class="warn" title="Racionando">½🥫</span>' : ''}</span>
        <span class="tb-net muted">${acc.online ? '☁️ online' : '💾 offline'}</span>
      </div>
      <div class="tb-res">${resources}</div>`;
  }

  private emergencies(s: ShelterState): string {
    return pendingEmergencies(s)
      .map((e) => {
        const v = s.survivors.find((x) => x.id === e.emergency!.survivorId)!;
        const loc = locationById(e.locationId);
        return `<div class="card alert">
          <h3>🚨 Emergência · decida até ${clock(e.emergency!.deadline)}</h3>
          <div class="name" style="font-size:15px">${v.name} está encurralado(a) em ${loc.name}</div>
          <p class="small">Se ninguém fizer nada, ${v.name} tenta sair sozinho(a), com o dobro do risco. Você pode assumir o controle e jogar a fuga, ou confiar na sorte.</p>
          <div class="actions">${cmdBtn('Assumir o controle', { cmd: 'takeOver', expId: e.id }, 'primary')}${cmdBtn('Deixar com ele(a)', { cmd: 'delegate', expId: e.id })}</div>
        </div>`;
      })
      .join('');
  }

  private dilemmas(s: ShelterState): string {
    return s.dilemmas
      .map(
        (d) => `
        <div class="card door">
          ${banner(d.kind === 'bandits' ? 'raiders' : 'door')}
          <h3>Na porta · vai embora em ${d.expiresHour - s.hour}h</h3>
          <div class="name" style="font-size:15px">${d.title}</div>
          <p class="small">${d.text}</p>
          <div class="actions">${d.options.map((o, i) => cmdBtn(o.label, { cmd: 'dilemma', id: d.id, option: o.id }, i === 0 ? 'primary' : '')).join('')}</div>
        </div>`,
      )
      .join('');
  }

  private expeditionList(s: ShelterState): string {
    return s.expeditions
      .map((e) => {
        const l = locationById(e.locationId);
        const who = s.survivors.filter((v) => v.expeditionId === e.id).map((v) => v.name).join(' e ') || '—';
        return `<div class="row"><span>${who} → ${l.icon} ${l.name} <span class="muted small">${e.departed ? `volta ${clock(e.returnHour)}` : `sai ${clock(e.departHour)}`}</span></span>${e.departed ? '' : cmdBtn('Cancelar', { cmd: 'cancelExp', id: e.id })}</div>`;
      })
      .join('');
  }

  private shelterView(s: ShelterState): string {
    const alive = s.survivors.filter((v) => v.status === 'home' || v.status === 'away');

    const people = s.survivors
      .filter((v) => v.status !== 'dead' && v.status !== 'gone')
      .map((v) => this.survivorCard(s, v))
      .join('');
    const lost = s.survivors.filter((v) => v.status === 'dead' || v.status === 'gone');
    const short = alive.length && (s.resources.food < alive.length || s.resources.water < alive.length);

    return `
      ${this.goalCard(s)}
      <div class="card"><h3>Sobreviventes</h3>${people}${lost.length ? `<div class="small muted">Perdidos: ${lost.map((v) => `${v.name} (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`).join(', ')}</div>` : ''}
        <div class="row small ration"><label><input type="checkbox" ${s.rationing ? 'checked' : ''} data-cmd='${JSON.stringify({ cmd: 'ration', on: !s.rationing })}'/> Racionar (meia porção, humor cai)</label>${short ? '<span class="bad">falta comida ou água</span>' : ''}</div>
      </div>
      <div class="card"><h3>Expedições</h3>
        ${this.expeditionList(s) || '<div class="small muted">Nenhuma planejada.</div>'}
        <div class="actions" style="margin-top:6px">${cmdBtn('🗺️ Planejar no mapa', { cmd: 'tab', tab: 'map' })}</div>
      </div>`;
  }

  private logView(s: ShelterState): string {
    return `
      <div class="card"><h3>Diário</h3><div class="log tall">${diaryHtml(s.diary.slice(-80))}</div></div>
      ${this.accountCard()}
      <div class="card"><h3>Ferramentas de teste</h3>
        <div class="row small"><span class="muted">1 dia de jogo = 12h reais. Avançar o relógio:</span>
          <span class="actions">${cmdBtn('+1h', { cmd: 'skip', hours: 1 })}${cmdBtn('+6h', { cmd: 'skip', hours: 6 })}</span></div>
      </div>`;
  }

  private benchView(s: ShelterState): string {
    const home = s.survivors.filter((v) => v.status === 'home');
    const project = s.project
      ? (() => {
          const def = RECIPES[s.project.recipe];
          const builders = home.filter((v) => v.task === 'craft').length;
          return `<div class="row"><span>${def.icon} ${def.name}</span>${cmdBtn('Cancelar', { cmd: 'cancelBuild' })}</div>
            <div class="bar"><div style="width:${(s.project.progress / def.hours) * 100}%"></div></div>
            <div class="small muted">${fmt(s.project.progress)}/${def.hours}h de trabalho · ${builders ? `${builders} construindo` : '<span class="warn">ninguém na tarefa Construir</span>'}${def.needsWorkbench && !s.buildings.workbench ? ' · <span class="bad">precisa de bancada</span>' : ''}</div>`;
        })()
      : '<div class="small muted">Nenhum projeto. Escolha algo abaixo.</div>';
    const queue = s.buildQueue.length
      ? `<div class="small muted" style="margin-top:6px">Na fila (começa sozinho quando houver material):</div>${s.buildQueue
          .map((r, i) => `<div class="row small"><span>${i + 1}. ${RECIPES[r].icon} ${RECIPES[r].name}</span>${cmdBtn('Tirar', { cmd: 'unqueue', index: i })}</div>`)
          .join('')}`
      : '';

    const recipes = (Object.keys(RECIPES) as RecipeId[])
      .map((id) => {
        const def = RECIPES[id];
        const count = id === 'weapon' ? s.resources.weapons : s.buildings[id];
        const maxed = id !== 'weapon' && count >= def.max;
        const startNow = !s.project && (!def.needsWorkbench || s.buildings.workbench > 0) && canAfford(s, def.cost);
        const action = startNow
          ? `<button data-cmd='${JSON.stringify({ cmd: 'build', recipe: id })}'>Construir</button>`
          : `<button data-cmd='${JSON.stringify({ cmd: 'queue', recipe: id })}' ${s.buildQueue.length >= 6 ? 'disabled' : ''} title="Começa sozinho quando houver material e a bancada estiver livre">Pôr na fila</button>`;
        return `<div class="recipe" title="${def.description}">
          <div class="row"><span>${def.icon} ${def.name} <span class="muted">${id === 'weapon' ? '' : `${count}/${def.max}`}</span></span>
          ${maxed ? '<span class="muted small">máx.</span>' : action}</div>
          <div class="small muted">${describeCost(def.cost)} · ${def.hours}h${def.needsWorkbench ? '' : ' · sem bancada'}</div>
        </div>`;
      })
      .join('');

    const builders = home.filter((v) => v.task === 'craft').map((v) => v.name);
    return `
      <div class="card"><h3>Em construção</h3>${project}${queue}
        <div class="small muted" style="margin-top:6px">${builders.length ? `Na tarefa Construir: ${builders.join(', ')}.` : 'Ninguém está na tarefa Construir. Mude a tarefa de alguém na aba Abrigo.'}</div>
      </div>
      <div class="card"><h3>O que dá para fazer</h3><div class="recipes">${recipes}</div></div>`;
  }

  /** O objetivo de longo prazo: rádio → transmissão → suprimentos → partir. */
  private goalCard(s: ShelterState): string {
    const stage = goalStage(s);
    const order = ['radio', 'signal', 'supplies', 'ended'];
    const step = (id: string, text: string) => {
      const done = order.indexOf(stage) > order.indexOf(id);
      const active = stage === id;
      return `<div class="small ${done ? 'good' : active ? '' : 'muted'}">${done ? '✔' : active ? '▸' : '·'} ${text}</div>`;
    };
    let detail = '';
    if (stage === 'radio') {
      detail = `<div class="small muted">Construa o 📻 rádio na bancada (${describeCost(RECIPES.radio.cost)}).</div>
        <div class="actions" style="margin-top:6px">${cmdBtn('🔨 Abrir a bancada', { cmd: 'tab', tab: 'bench' })}</div>`;
    } else if (stage === 'signal') {
      detail = `<div class="bar"><div style="width:${(s.signal / SIGNAL_HOURS) * 100}%"></div></div>
        <div class="small muted">${s.signal}/${SIGNAL_HOURS}h de escuta. Anda sozinho, toda noite, enquanto houver alguém em casa.</div>`;
    } else if (stage === 'supplies') {
      const need = evacuationNeeds(s);
      const alive = aliveSurvivors(s);
      const allHome = !s.activeRaid && alive.every((v) => v.status === 'home');
      const item = (ok: boolean, text: string) => `<span class="res ${ok ? 'good' : 'bad'}">${text}</span>`;
      const ready = allHome && s.resources.fuel >= need.fuel && s.resources.food >= need.food && s.resources.water >= need.water;
      detail = `<div class="resgrid" style="margin:6px 0">
          ${item(s.resources.fuel >= need.fuel, `⛽ ${fmt(s.resources.fuel)}/${need.fuel}`)}
          ${item(s.resources.food >= need.food, `🥫 ${fmt(s.resources.food)}/${need.food}`)}
          ${item(s.resources.water >= need.water, `💧 ${fmt(s.resources.water)}/${need.water}`)}
          ${item(allHome, allHome ? '🏠 todos em casa' : '🏠 falta gente')}
        </div>
        <div class="small muted">Combustível aparece na Oficina do Seu Zé. Partir encerra a história: vai quem estiver vivo.</div>
        <div class="actions" style="margin-top:6px"><button class="primary" data-cmd='${JSON.stringify({ cmd: 'evacuate' })}' ${ready ? '' : 'disabled'}>🚗 Partir para o cais</button></div>`;
    }
    return `<div class="card"><h3>Objetivo · sair da cidade</h3>
      ${step('radio', 'Construir um rádio')}
      ${step('signal', 'Decifrar a transmissão')}
      ${step('supplies', 'Juntar combustível e mantimentos e partir')}
      ${detail}</div>`;
  }

  private accountCard(): string {
    const acc = this.hooks.account();
    let body: string;
    if (!acc.online) body = '<div class="small muted">Modo offline: o abrigo fica salvo só neste navegador.</div>';
    else if (!acc.anonymous && acc.email) body = `<div class="small">Salvo na conta <strong>${acc.email}</strong>.</div>`;
    else
      body = `<div class="small muted" style="margin-bottom:6px">Você está jogando como anônimo. Vincule um e-mail para não perder o abrigo se trocar de aparelho.</div>
        <div class="row"><input name="email" type="email" placeholder="seu@email.com" autocomplete="email"/>${cmdBtn('Vincular', { cmd: 'link' })}</div>`;
    return `<div class="card"><h3>Conta</h3>${body}${this.notice ? `<div class="small warn" style="margin-top:6px">${this.notice}</div>` : ''}</div>`;
  }

  private mapView(s: ShelterState): string {
    const loc = locationById(this.selected);
    const known = s.discovered.includes(loc.id);
    const known_ = s.discovered.length;
    const header = `<div class="card"><h3>Região · ${known_}/${LOCATIONS.length} locais conhecidos</h3>
      <div class="small muted">Clique num local no mapa. ${hasUndiscovered(s) ? 'Locais com <strong>?</strong> são revelados por mapas rabiscados, que só aparecem em incursões ativas.' : 'Todos os locais da região são conhecidos.'}</div></div>`;

    if (!known) {
      return `${header}<div class="card"><h3>Local desconhecido</h3>
        <div class="name">???</div>
        <p class="small muted">Ninguém sabe o caminho. Entre numa incursão ativa e procure um <strong>🗺️ mapa rabiscado</strong> nos containers mais fundos do prédio.</p></div>
        <div class="card"><h3>Expedições</h3>${this.expeditionList(s) || '<div class="small muted">Nenhuma planejada.</div>'}</div>`;
    }

    const stock = Math.round(s.locationStock[loc.id] ?? 100);
    const lootPreview = [...new Set(loc.loot)].map((it) => `${ITEMS[it].icon} ${ITEMS[it].name}`).join(', ');
    const free = s.survivors.filter((v) => v.status === 'home' && v.expeditionId === null);
    const today = dayOf(s.hour);
    const canRaid = free.filter((v) => v.raidDay !== today);
    const st = s.standing;
    const standing = st
      ? `<div class="row small"><span>🔁 Toda noite: ${st.ids.map((id) => s.survivors.find((v) => v.id === id)?.name ?? '?').join(' e ')} → ${locationById(st.locationId).name} <span class="muted">(${RISK_RULES[st.risk].name.toLowerCase()})</span></span>${cmdBtn('Cancelar ordem', { cmd: 'standing', on: false })}</div>`
      : '';
    const weapons = Math.floor(s.resources.weapons);
    const bandages = Math.min(2, Math.floor(s.resources.bandages));
    const gear = `<div class="who">
        <label title="Dobra o dano e arromba portas. Perdida se o sobrevivente não voltar."><input type="checkbox" name="raid-weapon" ${this.loadout.weapon && weapons ? 'checked' : ''} ${weapons ? '' : 'disabled'}/> Levar arma (${weapons} no abrigo)</label>
        <label>Bandagens <select name="raid-bandages" ${bandages ? '' : 'disabled'}>${[0, 1, 2].filter((n) => n <= bandages).map((n) => `<option value="${n}" ${n === Math.min(this.loadout.bandages, bandages) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>`;
    const raidOptions = canRaid
      .map((v) => `<option value="${v.id}" ${v.id === this.raidWho ? 'selected' : ''}>${v.name} · saúde ${Math.round(v.health)}${v.sick ? ' · doente' : ''}</option>`)
      .join('');

    return `${header}
      <div class="card">
        ${placeUrl(loc.id) ? banner(loc.id, 'tall') : ''}
        <div class="row"><span class="name">${loc.icon} ${loc.name}</span><span class="${loc.danger === 3 ? 'bad' : 'warn'}">${'☠'.repeat(loc.danger)}</span></div>
        <p class="small muted" style="margin:4px 0">${loc.description}</p>
        <div class="small">Costuma ter: ${lootPreview}</div>
        <div class="small">Estoque: <strong class="${stock < 40 ? 'bad' : stock < 70 ? 'warn' : 'good'}">${stock}%</strong> <span class="muted">(se recupera com o tempo)</span></div>
      </div>
      <div class="card"><h3>Expedição noturna (automática)</h3>
        <div class="small muted" style="margin-bottom:6px">Sai às 21h, volta às 6h. Pode dar errado no meio da noite.</div>
        <div class="who">${free.length ? free.map((v) => `<label><input type="checkbox" name="exp-who" value="${v.id}" ${this.exp.ids.has(v.id) ? 'checked' : ''}/> ${v.name}</label>`).join('') : '<span class="small muted">Ninguém disponível.</span>'}</div>
        <select name="exp-risk">${(Object.keys(RISK_RULES) as RiskRule[]).map((r) => `<option value="${r}" ${r === this.exp.risk ? 'selected' : ''}>Regra ${RISK_RULES[r].name.toLowerCase()}: ${RISK_RULES[r].description}</option>`).join('')}</select>
        <div class="actions" style="margin-top:6px">${cmdBtn('Enviar esta noite', { cmd: 'send' }, 'primary')}${cmdBtn('🔁 Repetir toda noite', { cmd: 'standing', on: true })}</div>
        ${standing}
        ${this.expeditionList(s)}
      </div>
      <div class="card"><h3>Incursão ativa (você joga)</h3>
        <div class="small muted" style="margin-bottom:6px">Uma por dia por pessoa. O loot depende do estoque do local. ${hasUndiscovered(s) && !s.mapsFound.includes(loc.id) ? 'Há um 🗺️ mapa rabiscado escondido aqui.' : ''} Quem morrer lá dentro não volta.</div>
        ${canRaid.length ? `<select name="raid-who">${raidOptions}</select>${gear}<div class="actions" style="margin-top:6px">${cmdBtn(`Entrar em ${loc.name}`, { cmd: 'raid' }, 'primary')}</div>` : `<span class="small muted">${free.length ? 'Todos que estão em casa já saíram hoje.' : 'Ninguém disponível.'}</span>`}
      </div>`;
  }

  private survivorCard(s: ShelterState, v: ShelterSurvivor): string {
    const emo = emotionOf(v.mood);
    const away = v.status === 'away' || v.status === 'raid';
    const booked = v.expeditionId !== null;
    const eff = workEfficiency(v);
    const talked = v.talkedDay === dayOf(s.hour);
    const bonds =
      friendsOf(s, v).map((o) => `<span class="chip" title="Amigos: rendem mais na mesma tarefa, se protegem em expedição e seguram o humor um do outro.">💛 ${o.name}</span>`).join('') +
      rivalsOf(s, v).map((o) => `<span class="chip neg" title="Desafetos: rendem menos na mesma tarefa e se atrapalham em expedição.">⚡ ${o.name}</span>`).join('');
    const face = this.hooks.portrait(v.id);
    return `<div class="survivor-card">
      <div class="row"><button class="who-name who-open" title="Abrir a ficha" data-cmd='${JSON.stringify({ cmd: 'profile', id: v.id })}'>${face ? `<img class="face" src="${face}" alt=""/>` : ''}${v.name}</button>
        <span class="small ${EMOTION_CLASS[emo]}">${away ? `<span class="warn">${v.status === 'raid' ? 'em incursão' : 'em expedição'}</span>` : `${EMOTION_LABEL[emo]}${v.sick ? ' · <span class="bad">doente</span>' : ''}${booked ? ' · <span class="warn">sai à noite</span>' : ''}`}</span></div>
      <div class="chips">${v.traits.map((t) => `<span class="chip ${TRAITS[t].negative ? 'neg' : ''}" title="${TRAITS[t].description}">${TRAITS[t].name}</span>`).join('')}${bonds}</div>
      <div class="stats">
        ${stat('Saúde', v.health, false)}${stat('Humor', v.mood, false)}
        ${stat('Fome', v.hunger, true)}${stat('Sede', v.thirst, true)}${stat('Cansaço', v.fatigue, true)}
      </div>
      ${
        away
          ? ''
          : `<div class="row small controls">
        <select data-task="${v.id}">${(Object.keys(TASKS) as TaskId[]).map((t) => `<option value="${t}" ${t === v.task ? 'selected' : ''}>${TASKS[t].name}</option>`).join('')}</select>
        ${eff === 0 ? '<span class="bad">não trabalha</span>' : eff < 1 ? '<span class="warn">rende pouco</span>' : ''}
        <span class="actions">
          <button data-cmd='${JSON.stringify({ cmd: 'talk', id: v.id })}' ${talked ? 'disabled title="Já conversaram hoje"' : ''}>Conversar</button>
          <button data-cmd='${JSON.stringify({ cmd: 'planRaid', id: v.id })}' ${booked ? 'disabled title="Escalado(a) para expedição"' : v.raidDay === dayOf(s.hour) ? 'disabled title="Já saiu hoje"' : ''} title="Escolher um local no mapa para uma incursão ativa">Incursão</button>
        </span></div>`
      }
    </div>`;
  }
}

const STATUS_LABEL: Record<ShelterSurvivor['status'], string> = { home: 'no abrigo', away: 'em expedição', raid: 'em incursão', dead: 'morto(a)', gone: 'foi embora' };

/** Ficha do personagem: retrato grande, história, traços, estado e laços. */
export function profileHtml(s: ShelterState, v: ShelterSurvivor, face: string | null): string {
  const emo = emotionOf(v.mood);
  const alive = v.status !== 'dead' && v.status !== 'gone';
  const num = (label: string, value: number, inverted: boolean) => {
    const danger = inverted ? value >= 70 : value <= 30;
    return `<div class="pstat"><span>${label}</span><div class="bar ${danger ? 'full' : ''}"><div style="width:${value}%"></div></div><strong class="${danger ? 'bad' : ''}">${Math.round(value)}</strong></div>`;
  };
  const others = aliveSurvivors(s)
    .filter((o) => o.id !== v.id)
    .map((o) => ({ o, bond: bondOf(s, v.id, o.id) }))
    .sort((a, b) => b.bond - a.bond);
  const bondWord = (b: number) => (b >= FRIEND ? '💛 amigos' : b <= RIVAL ? '⚡ desafetos' : b >= 15 ? 'se dão bem' : b <= -15 ? 'se estranham' : 'conhecidos');
  const bonds = others.length
    ? others
        .map(({ o, bond }) => `<div class="row small"><span>${o.name}</span><span class="${bond >= FRIEND ? 'good' : bond <= RIVAL ? 'bad' : 'muted'}">${bondWord(bond)}</span></div>`)
        .join('')
    : '<div class="small muted">Não sobrou ninguém.</div>';
  const mentions = s.diary.filter((e) => e.text.includes(v.name)).slice(-6);
  return `<div class="profile">
      <div class="profile-face">${face ? `<img src="${face}" alt="Retrato de ${v.name}"/>` : ''}</div>
      <div class="profile-body">
        <h1>${v.name}</h1>
        <div class="small ${alive ? EMOTION_CLASS[emo] : 'bad'}">${STATUS_LABEL[v.status]}${alive ? ` · ${EMOTION_LABEL[emo]}${v.sick ? ' · doente' : ''}` : ''}</div>
        <p class="profile-bio">${v.bio}</p>
        ${v.traits.map((t) => `<div class="small"><span class="chip ${TRAITS[t].negative ? 'neg' : ''}">${TRAITS[t].name}</span> <span class="muted">${TRAITS[t].description}</span></div>`).join('')}
        ${alive ? `<div class="pstats">${num('Saúde', v.health, false)}${num('Humor', v.mood, false)}${num('Fome', v.hunger, true)}${num('Sede', v.thirst, true)}${num('Cansaço', v.fatigue, true)}</div>
        <div class="small muted">Tarefa: <strong>${TASKS[v.task].name}</strong>. ${TASKS[v.task].description}</div>` : ''}
        <h3>Laços</h3>${bonds}
        <h3>No diário</h3><div class="log report">${mentions.length ? diaryHtml(mentions) : '<div class="muted">Nada ainda.</div>'}</div>
      </div>
    </div>`;
}

export function diaryHtml(entries: DiaryEntry[]): string {
  return entries
    .map((e) => `<div class="${e.tone === 'info' ? '' : e.tone}"><span class="muted">${clock(e.hour)}</span> ${e.text}</div>`)
    .join('');
}

function stat(label: string, value: number, inverted: boolean): string {
  const danger = inverted ? value >= 70 : value <= 30;
  return `<div class="stat" title="${label}: ${Math.round(value)}"><span>${label}</span><div class="bar ${danger ? 'full' : ''}"><div style="width:${value}%"></div></div></div>`;
}

function cmdBtn(label: string, cmd: Cmd, cls = ''): string {
  return `<button class="${cls}" data-cmd='${JSON.stringify(cmd)}'>${label}</button>`;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

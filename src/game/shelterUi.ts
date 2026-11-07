import { LOCATIONS, RECIPES, RESOURCES, RISK_RULES, TASKS, type RecipeId, type ResourceId, type RiskRule, type TaskId } from '../data/shelter';
import { TRAITS } from '../data/survivors';
import { canAfford, dayOf, describeCost, emotionOf, hourOfDay, isNight } from '../sim/shelter/core';
import { cancelExpedition, sendExpedition } from '../sim/shelter/expeditions';
import { cancelProject, setRationing, setTask, startProject, talk, workEfficiency } from '../sim/shelter/shelter';
import type { DiaryEntry, Emotion, ShelterState, ShelterSurvivor } from '../sim/shelter/types';
import { resolveDilemma } from '../sim/shelter/visitors';

type Cmd =
  | { cmd: 'task'; id: string; task: TaskId }
  | { cmd: 'talk'; id: string }
  | { cmd: 'raid'; id: string }
  | { cmd: 'build'; recipe: RecipeId }
  | { cmd: 'cancelBuild' }
  | { cmd: 'dilemma'; id: number; option: string }
  | { cmd: 'send' }
  | { cmd: 'cancelExp'; id: number }
  | { cmd: 'ration'; on: boolean }
  | { cmd: 'speed'; value: number }
  | { cmd: 'skip'; hours: number };

export interface ShelterUiHooks {
  changed: () => void;
  startRaid: (survivorId: string) => void;
  setSpeed: (value: number) => void;
  skip: (hours: number) => void;
  speed: () => number;
}

const EMOTION_LABEL: Record<Emotion, string> = { ok: 'bem', triste: 'triste', deprimido: 'deprimido(a)', quebrado: 'quebrado(a)' };
const EMOTION_CLASS: Record<Emotion, string> = { ok: 'good', triste: 'warn', deprimido: 'bad', quebrado: 'bad' };
const SHOWN_RESOURCES: ResourceId[] = ['water', 'dirtyWater', 'food', 'meds', 'bandages', 'wood', 'scrap', 'parts', 'components', 'fuel', 'ammo', 'weapons', 'waste'];

export function clock(hour: number): string {
  return `Dia ${dayOf(hour)} · ${String(hourOfDay(hour)).padStart(2, '0')}:00`;
}

/** HUD do abrigo. Guarda só o rascunho do formulário de expedição; o resto vem do estado. */
export class ShelterUi {
  private state: ShelterState | null = null;
  private exp = { loc: 'market', ids: new Set<string>(), risk: 'balanced' as RiskRule };
  private error = '';

  constructor(
    private hud: HTMLElement,
    private hooks: ShelterUiHooks,
  ) {
    hud.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-cmd]') as HTMLElement | null;
      if (!el || !this.state || el.tagName === 'SELECT') return;
      this.run(JSON.parse(el.dataset.cmd!) as Cmd);
    });
    hud.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      if (!this.state) return;
      if (el.dataset.task) this.run({ cmd: 'task', id: el.dataset.task, task: el.value as TaskId });
      else if (el.name === 'exp-loc') this.exp.loc = el.value;
      else if (el.name === 'exp-risk') this.exp.risk = el.value as RiskRule;
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

  private run(c: Cmd): void {
    const s = this.state!;
    this.error = '';
    switch (c.cmd) {
      case 'task': setTask(s, c.id, c.task); break;
      case 'talk': talk(s, c.id); break;
      case 'raid': this.hooks.startRaid(c.id); return;
      case 'build': this.error = startProject(s, c.recipe) ?? ''; break;
      case 'cancelBuild': cancelProject(s); break;
      case 'dilemma': resolveDilemma(s, c.id, c.option); break;
      case 'send':
        this.error = sendExpedition(s, this.exp.loc, [...this.exp.ids], this.exp.risk) ?? '';
        if (!this.error) this.exp.ids.clear();
        break;
      case 'cancelExp': cancelExpedition(s, c.id); break;
      case 'ration': setRationing(s, c.on); break;
      case 'speed': this.hooks.setSpeed(c.value); break;
      case 'skip': this.hooks.skip(c.hours); return;
    }
    this.hooks.changed();
  }

  render(): void {
    const s = this.state;
    if (!s) return;
    const night = isNight(hourOfDay(s.hour));
    const speed = this.hooks.speed();
    const home = s.survivors.filter((v) => v.status === 'home');
    const alive = s.survivors.filter((v) => v.status === 'home' || v.status === 'away');

    const dilemmas = s.dilemmas
      .map(
        (d) => `
        <div class="card door">
          <h3>Na porta · vai embora em ${d.expiresHour - s.hour}h</h3>
          <div class="name" style="font-size:15px">${d.title}</div>
          <p class="small">${d.text}</p>
          <div class="actions">${d.options.map((o, i) => cmdBtn(o.label, { cmd: 'dilemma', id: d.id, option: o.id }, i === 0 ? 'primary' : '')).join('')}</div>
        </div>`,
      )
      .join('');

    const resources = SHOWN_RESOURCES.map((r) => {
      const v = s.resources[r];
      const low = (r === 'water' || r === 'food') && v < alive.length;
      const bad = r === 'waste' && v > 8;
      return `<div class="res ${low || bad ? 'bad' : ''}" title="${RESOURCES[r].name}">${RESOURCES[r].icon} <span>${fmt(v)}</span></div>`;
    }).join('');

    const people = s.survivors
      .filter((v) => v.status !== 'dead' && v.status !== 'gone')
      .map((v) => this.survivorCard(s, v))
      .join('');
    const lost = s.survivors.filter((v) => v.status === 'dead' || v.status === 'gone');

    const project = s.project
      ? (() => {
          const def = RECIPES[s.project.recipe];
          const builders = home.filter((v) => v.task === 'craft').length;
          return `<div class="row"><span>${def.icon} ${def.name}</span>${cmdBtn('Cancelar', { cmd: 'cancelBuild' })}</div>
            <div class="bar"><div style="width:${(s.project.progress / def.hours) * 100}%"></div></div>
            <div class="small muted">${fmt(s.project.progress)}/${def.hours}h de trabalho · ${builders ? `${builders} construindo` : '<span class="warn">ninguém na tarefa Construir</span>'}${def.needsWorkbench && !s.buildings.workbench ? ' · <span class="bad">precisa de bancada</span>' : ''}</div>`;
        })()
      : '<div class="small muted">Nenhum projeto. Escolha algo abaixo.</div>';

    const recipes = (Object.keys(RECIPES) as RecipeId[])
      .map((id) => {
        const def = RECIPES[id];
        const count = id === 'weapon' ? s.resources.weapons : s.buildings[id];
        const maxed = id !== 'weapon' && count >= def.max;
        const blocked = maxed || !!s.project || (def.needsWorkbench && !s.buildings.workbench) || !canAfford(s, def.cost);
        return `<div class="recipe" title="${def.description}">
          <div class="row"><span>${def.icon} ${def.name} <span class="muted">${id === 'weapon' ? '' : `${count}/${def.max}`}</span></span>
          ${maxed ? '<span class="muted small">máx.</span>' : `<button data-cmd='${JSON.stringify({ cmd: 'build', recipe: id })}' ${blocked ? 'disabled' : ''}>Construir</button>`}</div>
          <div class="small muted">${describeCost(def.cost)} · ${def.hours}h${def.needsWorkbench ? '' : ' · sem bancada'}</div>
        </div>`;
      })
      .join('');

    const free = home.filter((v) => v.expeditionId === null);
    const loc = LOCATIONS.find((l) => l.id === this.exp.loc)!;
    const expeditions = s.expeditions
      .map((e) => {
        const l = LOCATIONS.find((x) => x.id === e.locationId)!;
        const who = s.survivors.filter((v) => v.expeditionId === e.id).map((v) => v.name).join(' e ');
        return `<div class="row"><span>${who} → ${l.name} <span class="muted small">${e.departed ? `volta ${clock(e.returnHour)}` : `sai ${clock(e.departHour)}`}</span></span>${e.departed ? '' : cmdBtn('Cancelar', { cmd: 'cancelExp', id: e.id })}</div>`;
      })
      .join('');

    const stockOf = (id: string) => Math.round(s.locationStock[id] ?? 100);

    this.hud.innerHTML = `
      <div class="card">
        <div class="row"><span class="name">${night ? '🌙' : '☀️'} ${clock(s.hour)}</span><span>${s.raining ? '🌧️ chuva' : ''}</span></div>
        <div class="row small muted"><span>1 dia de jogo = 12h reais</span>
          <span class="actions">${[1, 60, 600].map((v) => cmdBtn(`${v}×`, { cmd: 'speed', value: v }, v === speed ? 'primary' : '')).join('')}
          ${cmdBtn('+1h', { cmd: 'skip', hours: 1 })}${cmdBtn('+6h', { cmd: 'skip', hours: 6 })}</span></div>
      </div>
      ${dilemmas}
      <div class="card"><h3>Recursos</h3><div class="resgrid">${resources}</div>
        <div class="row small" style="margin-top:6px"><label><input type="checkbox" ${s.rationing ? 'checked' : ''} data-cmd='${JSON.stringify({ cmd: 'ration', on: !s.rationing })}'/> Racionar (meia porção, humor cai)</label></div>
      </div>
      <div class="card"><h3>Sobreviventes</h3>${people}${lost.length ? `<div class="small muted">Perdidos: ${lost.map((v) => `${v.name} (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`).join(', ')}</div>` : ''}</div>
      <div class="card"><h3>Expedição noturna</h3>
        <div class="small muted" style="margin-bottom:6px">Saem às 21h, voltam às 6h e resolvem tudo sozinhos.</div>
        <select name="exp-loc">${LOCATIONS.map((l) => `<option value="${l.id}" ${l.id === this.exp.loc ? 'selected' : ''}>${l.name} · perigo ${'☠'.repeat(l.danger)} · estoque ${stockOf(l.id)}%</option>`).join('')}</select>
        <div class="small muted">${loc.description}</div>
        <div class="who">${free.length ? free.map((v) => `<label><input type="checkbox" name="exp-who" value="${v.id}" ${this.exp.ids.has(v.id) ? 'checked' : ''}/> ${v.name}</label>`).join('') : '<span class="small muted">Ninguém disponível.</span>'}</div>
        <select name="exp-risk">${(Object.keys(RISK_RULES) as RiskRule[]).map((r) => `<option value="${r}" ${r === this.exp.risk ? 'selected' : ''}>Regra ${RISK_RULES[r].name.toLowerCase()}: ${RISK_RULES[r].description}</option>`).join('')}</select>
        <div class="actions" style="margin-top:6px">${cmdBtn('Enviar esta noite', { cmd: 'send' }, 'primary')}</div>
        ${expeditions}
      </div>
      <div class="card"><h3>Bancada</h3>${project}<div class="recipes">${recipes}</div></div>
      ${this.error ? `<div class="card bad small">${this.error}</div>` : ''}
      <div class="card"><h3>Diário</h3><div class="log">${diaryHtml(s.diary.slice(-40))}</div></div>
    `;
  }

  private survivorCard(s: ShelterState, v: ShelterSurvivor): string {
    const emo = emotionOf(v.mood);
    const away = v.status === 'away';
    const booked = v.expeditionId !== null;
    const eff = workEfficiency(v);
    const talked = v.talkedDay === dayOf(s.hour);
    return `<div class="survivor-card">
      <div class="row"><strong>${v.name}</strong>
        <span class="small ${EMOTION_CLASS[emo]}">${away ? '<span class="warn">em expedição</span>' : `${EMOTION_LABEL[emo]}${v.sick ? ' · <span class="bad">doente</span>' : ''}`}</span></div>
      <div class="chips">${v.traits.map((t) => `<span class="chip ${TRAITS[t].negative ? 'neg' : ''}" title="${TRAITS[t].description}">${TRAITS[t].name}</span>`).join('')}</div>
      <div class="stats">
        ${stat('Saúde', v.health, false)}${stat('Humor', v.mood, false)}
        ${stat('Fome', v.hunger, true)}${stat('Sede', v.thirst, true)}${stat('Cansaço', v.fatigue, true)}
      </div>
      ${
        away
          ? ''
          : `<div class="row small">
        <select data-task="${v.id}">${(Object.keys(TASKS) as TaskId[]).map((t) => `<option value="${t}" ${t === v.task ? 'selected' : ''}>${TASKS[t].name}</option>`).join('')}</select>
        ${eff === 0 ? '<span class="bad">não trabalha</span>' : eff < 1 ? '<span class="warn">rende pouco</span>' : ''}
        <span class="actions">
          <button data-cmd='${JSON.stringify({ cmd: 'talk', id: v.id })}' ${talked ? 'disabled title="Já conversaram hoje"' : ''}>Conversar</button>
          <button data-cmd='${JSON.stringify({ cmd: 'raid', id: v.id })}' ${booked ? 'disabled title="Escalado(a) para expedição"' : ''} title="Jogar uma incursão no Mercado com ${v.name}">Incursão</button>
        </span></div>`
      }
    </div>`;
  }
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

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

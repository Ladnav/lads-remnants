// Regras de "servidor": tudo o que muda o abrigo passa por aqui. O mesmo código roda
// no navegador (modo offline) e na Edge Function do Supabase (modo online), então o
// cliente nunca escreve o estado direto: só pede comandos.
import type { ItemId } from '../data/items';
import { locationById, type RecipeId, type RiskRule, type TaskId } from '../data/shelter';
import { replay } from '../sim/raid/raid';
import type { Action } from '../sim/raid/types';
import { aliveSurvivors, clamp, dayOf, hourOfDay, log } from '../sim/shelter/core';
import { cancelExpedition, delegateEmergency, pendingEmergencies, sendExpedition, takeOverEmergency } from '../sim/shelter/expeditions';
import {
  advanceTo,
  applyRaidResult,
  cancelProject,
  createShelter,
  evacuate,
  hasUndiscovered,
  isFinished,
  isGameOver,
  markSeen,
  migrate,
  queueProject,
  raidHp,
  setStanding,
  unqueueProject,
  setRationing,
  setTask,
  startProject,
  talk,
  tickHour,
  type RaidOutcome,
} from '../sim/shelter/shelter';
import type { RaidTicket, ShelterState, StandingOrder } from '../sim/shelter/types';
import { resolveDilemma } from '../sim/shelter/visitors';

export type ShelterCommand =
  | { type: 'task'; id: string; task: TaskId }
  | { type: 'talk'; id: string }
  | { type: 'build'; recipe: RecipeId }
  | { type: 'cancelBuild' }
  | { type: 'dilemma'; id: number; option: string }
  | { type: 'send'; locationId: string; ids: string[]; risk: RiskRule }
  | { type: 'cancelExp'; id: number }
  | { type: 'ration'; on: boolean }
  | { type: 'delegate'; expId: number }
  | { type: 'standing'; order: StandingOrder | null }
  | { type: 'queue'; recipe: RecipeId }
  | { type: 'unqueue'; index: number }
  | { type: 'evacuate' }
  | { type: 'seen' };

export interface RaidRequest {
  survivorId: string;
  locationId: string;
  /** Assumir o controle de uma emergência desta expedição. */
  emergencyExpId?: number;
  /** Equipamento tirado do estoque do abrigo. Perdido se o sobrevivente morrer ou fugir. */
  loadout?: { weapon?: boolean; bandages?: number };
}

/** Cansaço a partir do qual ninguém aceita sair para uma incursão. */
export const RAID_MAX_FATIGUE = 85;
const SPECIALS_BY_DANGER = { 1: 0.1, 2: 0.25, 3: 0.4 } as const;

/** Limite de ações por incursão: protege o servidor de logs gigantes. */
export const MAX_RAID_ACTIONS = 3000;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * Abre o abrigo: cria se não existir, migra saves antigos, avança o relógio e
 * encerra uma incursão que ficou aberta (aba fechada no meio da partida).
 */
export function openShelter(saved: ShelterState | null, nowMs: number, newSeed: number): ShelterState {
  const s = saved ? migrate(saved) : createShelter(newSeed, nowMs);
  if (s.activeRaid) abandonRaid(s);
  advanceTo(s, nowMs);
  return s;
}

/** Carrega sem encerrar incursões: usado por comandos que chegam durante uma partida. */
/** Um aviso para o celular do jogador. `tag` agrupa: um aviso novo do mesmo tipo troca o anterior. */
export interface Notice {
  title: string;
  body: string;
  tag: string;
}

const clockOf = (hour: number): string => `dia ${dayOf(hour)}, ${String(hourOfDay(hour)).padStart(2, '0')}h`;

/**
 * Avança o abrigo até agora sem o jogador por perto (chamado pelo agendador do servidor)
 * e diz se aconteceu algo que mereça um aviso. No máximo um aviso por vez, o mais urgente.
 * Não mexe em quem está no meio de uma incursão nem em história encerrada.
 */
export function tickShelter(saved: ShelterState, nowMs: number): { state: ShelterState; changed: boolean; notice: Notice | null } {
  const s = migrate(saved);
  if (s.activeRaid || isFinished(s)) return { state: s, changed: false, notice: null };
  const before = {
    hour: s.hour,
    diary: s.diary.length,
    doors: new Set(s.dilemmas.map((d) => d.id)),
    alarms: new Set(pendingEmergencies(s).map((e) => e.id)),
    alive: aliveSurvivors(s).length,
    trips: s.expeditions.map((e) => e.id),
  };
  advanceTo(s, nowMs);
  if (s.hour === before.hour) return { state: s, changed: false, notice: null };

  const news = s.diary.slice(Math.min(before.diary, s.diary.length));
  const lastBad = [...news].reverse().find((e) => e.tone === 'bad');
  const alarm = pendingEmergencies(s).find((e) => !before.alarms.has(e.id));
  const door = s.dilemmas.find((d) => !before.doors.has(d.id));
  let notice: Notice | null = null;
  if (isGameOver(s)) {
    notice = { title: 'A comunidade acabou', body: lastBad?.text ?? 'Ninguém sobrou no abrigo.', tag: 'fim' };
  } else if (alarm?.emergency) {
    const who = s.survivors.find((v) => v.id === alarm.emergency!.survivorId)?.name ?? 'Alguém';
    notice = {
      title: `Emergência: ${who} está encurralado(a)`,
      body: `Em ${locationById(alarm.locationId).name}. Assuma o controle ou deixe com a sorte até o ${clockOf(alarm.emergency.deadline)}.`,
      tag: 'emergencia',
    };
  } else if (door) {
    notice = { title: 'Batem na porta', body: `${door.title}. Vai embora em ${Math.max(1, door.expiresHour - s.hour)}h de jogo.`, tag: 'porta' };
  } else if (aliveSurvivors(s).length < before.alive) {
    notice = { title: 'Uma perda no abrigo', body: lastBad?.text ?? 'Alguém não está mais entre vocês.', tag: 'perda' };
  } else if (before.trips.some((id) => !s.expeditions.some((e) => e.id === id))) {
    const back = [...news].reverse().find((e) => /volt/i.test(e.text));
    notice = { title: 'A expedição voltou', body: back?.text ?? 'O grupo está de volta ao abrigo.', tag: 'expedicao' };
  }
  return { state: s, changed: true, notice };
}

export function resumeShelter(saved: ShelterState | null, nowMs: number, newSeed: number): ShelterState {
  return saved ? migrate(saved) : createShelter(newSeed, nowMs);
}

export { isFinished, isGameOver };

export function applyCommand(s: ShelterState, cmd: ShelterCommand, nowMs: number): Result<null> {
  advanceTo(s, nowMs);
  if (isGameOver(s)) return fail('A comunidade acabou.');
  if (s.ended) return fail('O grupo já partiu.');
  // Qualquer comando prova que o jogador está presente (tira o abrigo do modo de espera).
  if (cmd.type !== 'seen') s.lastSeenHour = s.hour;
  let error: string | null = null;
  switch (cmd.type) {
    case 'task': setTask(s, cmd.id, cmd.task); break;
    case 'talk': if (!talk(s, cmd.id)) error = 'Não dá para conversar agora.'; break;
    case 'build': error = startProject(s, cmd.recipe); break;
    case 'cancelBuild': cancelProject(s); break;
    case 'dilemma': resolveDilemma(s, cmd.id, cmd.option); break;
    case 'send': error = sendExpedition(s, cmd.locationId, cmd.ids, cmd.risk); break;
    case 'cancelExp': cancelExpedition(s, cmd.id); break;
    case 'ration': setRationing(s, cmd.on); break;
    case 'delegate': delegateEmergency(s, cmd.expId); break;
    case 'standing': error = setStanding(s, cmd.order); break;
    case 'queue': error = queueProject(s, cmd.recipe); break;
    case 'unqueue': unqueueProject(s, cmd.index); break;
    case 'evacuate': error = evacuate(s); break;
    case 'seen': markSeen(s); break;
    default: error = 'Comando desconhecido.';
  }
  return error ? fail(error) : ok(null);
}

export function startRaid(s: ShelterState, req: RaidRequest, seed: number, nowMs: number): Result<RaidTicket> {
  advanceTo(s, nowMs);
  if (isFinished(s)) return fail('Não há mais ninguém no abrigo.');
  if (s.activeRaid) return fail('Já existe uma incursão em andamento.');
  if (!s.discovered.includes(req.locationId)) return fail('Ninguém sabe o caminho até esse lugar.');
  const loc = locationById(req.locationId);

  let emergency = false;
  const startItems: ItemId[] = [];
  if (req.emergencyExpId !== undefined) {
    const taken = takeOverEmergency(s, req.emergencyExpId);
    if (!taken || taken.survivor.id !== req.survivorId || taken.locationId !== req.locationId) return fail('Essa emergência já passou.');
    emergency = true;
  } else {
    const v = s.survivors.find((x) => x.id === req.survivorId);
    if (!v || v.status !== 'home' || v.expeditionId !== null) return fail('Essa pessoa não está disponível.');
    if (v.raidDay === dayOf(s.hour)) return fail(`${v.name} já saiu hoje. Só amanhã.`);
    if (v.fatigue >= RAID_MAX_FATIGUE) return fail(`${v.name} está exausto(a) demais para sair.`);
    const bandages = Math.max(0, Math.min(2, Math.floor(req.loadout?.bandages ?? 0)));
    if (req.loadout?.weapon && s.resources.weapons < 1) return fail('Não há arma sobrando no abrigo.');
    if (s.resources.bandages < bandages) return fail('Não há bandagens suficientes.');
    if (req.loadout?.weapon) {
      s.resources.weapons -= 1;
      startItems.push('crowbar');
    }
    s.resources.bandages -= bandages;
    for (let i = 0; i < bandages; i++) startItems.push('bandage');
    v.raidDay = dayOf(s.hour);
    v.status = 'raid';
  }

  const v = s.survivors.find((x) => x.id === req.survivorId)!;
  const ticket: RaidTicket = {
    id: s.nextId++,
    survivorId: v.id,
    locationId: loc.id,
    seed,
    def: { id: v.id, name: v.name, bio: v.bio, traits: [...v.traits], maxHp: 3 },
    opts: {
      site: loc.name,
      loot: loc.loot,
      zombies: loc.zombies,
      startHp: raidHp(v),
      emergency,
      startItems,
      // O que sobrou no local: saquear demais deixa o prédio vazio.
      lootScale: ((s.locationStock[loc.id] ?? 100) / 100) * (emergency ? 0.5 : 1),
      specials: SPECIALS_BY_DANGER[loc.danger],
      mapNote: hasUndiscovered(s) && !s.mapsFound.includes(loc.id),
    },
  };
  s.activeRaid = ticket;
  return ok(ticket);
}

/** Reproduz a incursão a partir do log de ações e aplica o resultado no abrigo. */
export function finishRaid(s: ShelterState, raidId: number, actions: Action[], nowMs: number): Result<RaidOutcome> {
  const t = s.activeRaid;
  if (!t || t.id !== raidId) return fail('Essa incursão não existe mais.');
  if (!Array.isArray(actions) || actions.length > MAX_RAID_ACTIONS) return fail('Registro da incursão inválido.');

  let end;
  try {
    end = replay(t.seed, t.def, actions, t.opts);
  } catch {
    end = null;
  }
  if (!end || end.status === 'active') {
    // Não terminou (ou o registro não confere): vale como fuga sem nada.
    abandonRaid(s);
    advanceTo(s, nowMs);
    return fail('A incursão não terminou. Conta como fuga.');
  }

  const outcome: RaidOutcome = {
    status: end.status,
    items: [...end.backpack],
    hpLost: end.survivor.maxHp - end.survivor.hp,
    kills: end.kills,
  };
  s.activeRaid = null;
  const v = s.survivors.find((x) => x.id === t.survivorId);
  if (v && v.status === 'raid') v.status = 'home';
  applyRaidResult(s, t.survivorId, outcome, t.locationId, t.opts.startItems ?? []);
  advanceTo(s, nowMs);
  return ok(outcome);
}

/** Incursão largada no meio: o sobrevivente volta correndo, ferido e sem nada. */
export function abandonRaid(s: ShelterState): void {
  const t = s.activeRaid;
  if (!t) return;
  s.activeRaid = null;
  const v = s.survivors.find((x) => x.id === t.survivorId);
  if (!v || v.status !== 'raid') return;
  v.status = 'home';
  v.health = clamp(v.health - 25);
  v.mood = clamp(v.mood - 5);
  log(s, `${v.name} fugiu de ${locationById(t.locationId).name} às pressas, sem trazer nada e machucado(a).`, 'warn');
}

/** Ferramenta de teste: pula horas de jogo (o servidor só aceita com ALLOW_DEV_TOOLS). */
export function devSkip(s: ShelterState, hours: number): void {
  const n = Math.max(0, Math.min(48, Math.floor(hours)));
  for (let i = 0; i < n && !isFinished(s); i++) tickHour(s);
}

/** Nova semente de incursão (o servidor usa crypto; o modo offline, Math.random). */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] | 0 || 1;
  return (Math.random() * 2 ** 31) | 0 || 1;
}

/** Usado por quem só quer começar do zero (fim de jogo). */
export function newShelter(nowMs: number): ShelterState {
  return createShelter(randomSeed(), nowMs);
}


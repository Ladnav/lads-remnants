import { RESOURCES, type Cost, type ResourceId } from '../../data/shelter';
import type { EventTone } from '../raid/types';
import type { Emotion, ShelterState, ShelterSurvivor } from './types';

/** 1 hora de jogo = 30 minutos reais (1 dia de jogo = 12h reais). */
export const REAL_MS_PER_GAME_HOUR = 30 * 60 * 1000;

export const dayOf = (hour: number): number => Math.floor(hour / 24) + 1;
export const hourOfDay = (hour: number): number => ((hour % 24) + 24) % 24;
export const isNight = (h: number): boolean => h >= 21 || h < 6;

export function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export function emotionOf(mood: number): Emotion {
  if (mood >= 55) return 'ok';
  if (mood >= 35) return 'triste';
  if (mood >= 18) return 'deprimido';
  return 'quebrado';
}

export function log(s: ShelterState, text: string, tone: EventTone = 'info'): void {
  s.diary.push({ hour: s.hour, text, tone });
  if (s.diary.length > 400) s.diary.splice(0, s.diary.length - 400);
}

export function homeSurvivors(s: ShelterState): ShelterSurvivor[] {
  return s.survivors.filter((v) => v.status === 'home');
}

export function aliveSurvivors(s: ShelterState): ShelterSurvivor[] {
  return s.survivors.filter((v) => v.status === 'home' || v.status === 'away' || v.status === 'raid');
}

export function canAfford(s: ShelterState, cost: Cost): boolean {
  return (Object.keys(cost) as ResourceId[]).every((r) => s.resources[r] >= (cost[r] ?? 0));
}

export function addResources(s: ShelterState, cost: Cost, sign = 1): void {
  for (const r of Object.keys(cost) as ResourceId[]) {
    s.resources[r] = Math.max(0, s.resources[r] + sign * (cost[r] ?? 0));
  }
}

export function describeCost(cost: Cost): string {
  return (Object.keys(cost) as ResourceId[])
    .map((r) => `${cost[r]} ${RESOURCES[r].name.toLowerCase()}`)
    .join(', ');
}

export function changeMood(s: ShelterState, amount: number, except?: ShelterSurvivor): void {
  for (const v of aliveSurvivors(s)) if (v !== except) v.mood = clamp(v.mood + amount);
}

/** A partir de quanto um laço vira amizade, ou desafeto. */
export const FRIEND = 40;
export const RIVAL = -40;

export const bondKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const bondOf = (s: ShelterState, a: string, b: string): number => s.bonds[bondKey(a, b)] ?? 0;

export function friendsOf(s: ShelterState, v: ShelterSurvivor): ShelterSurvivor[] {
  return aliveSurvivors(s).filter((o) => o !== v && bondOf(s, v.id, o.id) >= FRIEND);
}

export function rivalsOf(s: ShelterState, v: ShelterSurvivor): ShelterSurvivor[] {
  return aliveSurvivors(s).filter((o) => o !== v && bondOf(s, v.id, o.id) <= RIVAL);
}

/** Muda o laço de um par e conta no diário quando vira amizade ou desafeto. */
export function addBond(s: ShelterState, a: string, b: string, amount: number): void {
  if (a === b) return;
  const before = bondOf(s, a, b);
  const after = clamp(before + amount, -100, 100);
  s.bonds[bondKey(a, b)] = after;
  const name = (id: string) => s.survivors.find((v) => v.id === id)?.name ?? '?';
  if (before < FRIEND && after >= FRIEND) log(s, `💛 ${name(a)} e ${name(b)} viraram amigos. Rendem mais juntos e seguram a barra um do outro.`, 'good');
  else if (before > RIVAL && after <= RIVAL) log(s, `⚡ ${name(a)} e ${name(b)} não se suportam mais. Melhor não deixar os dois na mesma tarefa.`, 'warn');
  else if (before >= FRIEND && after < FRIEND) log(s, `${name(a)} e ${name(b)} se afastaram.`, 'warn');
  else if (before <= RIVAL && after > RIVAL) log(s, `${name(a)} e ${name(b)} fizeram as pazes, mais ou menos.`);
}

export function die(s: ShelterState, v: ShelterSurvivor, text: string): void {
  v.status = 'dead';
  v.health = 0;
  v.expeditionId = null;
  log(s, text, 'bad');
  changeMood(s, -20, v);
  for (const f of friendsOf(s, v)) {
    f.mood = clamp(f.mood - 12);
    log(s, `${f.name} era próximo(a) de ${v.name}. Passou o dia sem dizer uma palavra.`, 'bad');
  }
}

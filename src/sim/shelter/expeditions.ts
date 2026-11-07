import { ITEMS, type ItemId } from '../../data/items';
import { ITEM_TO_RESOURCES, LOCATIONS, RISK_RULES, type RiskRule } from '../../data/shelter';
import { chance, pick, randInt } from '../rng';
import { addResources, clamp, die, hourOfDay, log } from './core';
import type { Expedition, ShelterState } from './types';

/** Expedições saem às 21h (ou na hora seguinte, se já for noite) e voltam às 6h. */
export function scheduleWindow(hour: number): { depart: number; ret: number } {
  const h = hourOfDay(hour);
  let depart = hour + 1;
  if (!(h >= 21 || h < 2)) {
    while (hourOfDay(depart) !== 21) depart++;
  }
  let ret = depart + 1;
  while (hourOfDay(ret) !== 6) ret++;
  return { depart, ret };
}

export function sendExpedition(s: ShelterState, locationId: string, ids: string[], risk: RiskRule): string | null {
  if (!LOCATIONS.some((l) => l.id === locationId)) return 'Local desconhecido.';
  if (ids.length < 1 || ids.length > 2) return 'Escolha 1 ou 2 sobreviventes.';
  const members = ids.map((id) => s.survivors.find((v) => v.id === id));
  if (members.some((v) => !v || v.status !== 'home' || v.expeditionId !== null)) return 'Alguém escolhido não está disponível.';
  const { depart, ret } = scheduleWindow(s.hour);
  const exp: Expedition = { id: s.nextId++, locationId, survivorIds: ids, risk, departHour: depart, returnHour: ret, departed: false };
  s.expeditions.push(exp);
  for (const v of members) v!.expeditionId = exp.id;
  const loc = LOCATIONS.find((l) => l.id === locationId)!;
  log(s, `${members.map((v) => v!.name).join(' e ')} ${members.length > 1 ? 'vão' : 'vai'} para ${loc.name} esta noite (regra ${RISK_RULES[risk].name.toLowerCase()}).`);
  return null;
}

export function cancelExpedition(s: ShelterState, id: number): void {
  const exp = s.expeditions.find((e) => e.id === id);
  if (!exp || exp.departed) return;
  for (const v of s.survivors) if (v.expeditionId === id) v.expeditionId = null;
  s.expeditions = s.expeditions.filter((e) => e !== exp);
}

export function processExpeditions(s: ShelterState): void {
  for (const exp of [...s.expeditions]) {
    const members = s.survivors.filter((v) => v.expeditionId === exp.id);
    if (!exp.departed && s.hour >= exp.departHour) {
      const going = members.filter((v) => v.status === 'home');
      if (!going.length) {
        cancelExpedition(s, exp.id);
        continue;
      }
      exp.departed = true;
      for (const v of going) v.status = 'away';
      log(s, `${going.map((v) => v.name).join(' e ')} ${going.length > 1 ? 'saem' : 'sai'} pela porta dos fundos, em silêncio.`);
    }
    if (exp.departed && s.hour >= exp.returnHour) {
      resolveExpedition(s, exp);
      s.expeditions = s.expeditions.filter((e) => e !== exp);
    }
  }
}

function resolveExpedition(s: ShelterState, exp: Expedition): void {
  const loc = LOCATIONS.find((l) => l.id === exp.locationId)!;
  const rule = RISK_RULES[exp.risk];
  const stock = s.locationStock[loc.id] ?? 100;
  for (const v of s.survivors.filter((x) => x.expeditionId === exp.id)) {
    v.expeditionId = null;
    if (v.status !== 'away') continue;
    v.status = 'home';
    let traitMul = 1;
    if (v.traits.includes('silencioso')) traitMul *= 0.7;
    if (v.traits.includes('lutador')) traitMul *= 0.7;
    if (v.traits.includes('medroso')) traitMul *= 1.2;
    const weak = v.health < 40 ? 2 : 1;
    const deathChance = loc.danger * 0.025 * Math.pow(rule.danger, 1.5) * traitMul * weak;
    const injuryChance = Math.min(0.9, loc.danger * 0.12 * rule.danger * traitMul);

    if (chance(s, deathChance)) {
      die(s, v, `${v.name} não voltou de ${loc.name}. Ninguém sabe o que aconteceu.`);
      continue;
    }
    if (chance(s, injuryChance)) {
      v.health = clamp(v.health - randInt(s, 15, 35));
      v.mood = clamp(v.mood - 5);
      log(s, `${v.name} voltou ferido(a) de ${loc.name}.`, 'warn');
      if (v.health <= 0) {
        die(s, v, `${v.name} não resistiu aos ferimentos.`);
        continue;
      }
    }

    let rolls = rule.loot + (v.traits.includes('forte') ? 2 : 0) - (v.traits.includes('medroso') ? 1 : 0);
    rolls = Math.max(0, Math.round(rolls * (0.4 + 0.6 * (stock / 100))));
    const items: ItemId[] = Array.from({ length: rolls }, () => pick(s, loc.loot));
    for (const it of items) addResources(s, ITEM_TO_RESOURCES[it]);
    s.locationStock[loc.id] = Math.max(10, (s.locationStock[loc.id] ?? 100) - rolls * 2);
    v.fatigue = clamp(v.fatigue + 30);
    if (items.length) {
      v.mood = clamp(v.mood + 3);
      log(s, `${v.name} trouxe de ${loc.name}: ${summarize(items)}.`, 'good');
    } else {
      log(s, `${v.name} voltou de ${loc.name} de mãos vazias. O lugar está quase limpo.`, 'warn');
    }
  }
}

export function summarize(items: readonly ItemId[]): string {
  const counts = new Map<ItemId, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return [...counts].map(([it, n]) => `${n}× ${ITEMS[it].name}`).join(', ');
}

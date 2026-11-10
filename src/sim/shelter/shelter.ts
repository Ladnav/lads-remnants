import { ITEMS, type ItemId } from '../../data/items';
import { ITEM_TO_RESOURCES, LOCATIONS, RECIPES, RESOURCES, RISK_RULES, locationById, type RecipeId, type ResourceId, type TaskId } from '../../data/shelter';
import { SURVIVORS } from '../../data/survivors';
import { chance, pick, randInt } from '../rng';
import {
  REAL_MS_PER_GAME_HOUR,
  addResources,
  aliveSurvivors,
  canAfford,
  changeMood,
  clamp,
  dayOf,
  die,
  emotionOf,
  homeSurvivors,
  hourOfDay,
  isNight,
  log,
} from './core';
import { processExpeditions, sendExpedition, summarize } from './expeditions';
import { expireDilemmas, maybeSpawnVisitor } from './visitors';
import type { ShelterState, ShelterSurvivor, StandingOrder } from './types';

export const START_HOUR = 8;
/** Ficar fora mais de uma semana não simula além disso. */
export const MAX_CATCHUP_HOURS = 24 * 7;
/** Horas de jogo sem visita (24h reais) até o abrigo entrar em modo de espera. */
export const DORMANT_AFTER = 48;

/** Modo de espera: o grupo come e bebe metade, e ninguém bate na porta. */
export function isDormant(s: ShelterState): boolean {
  return s.hour - s.lastSeenHour >= DORMANT_AFTER;
}

const STARTING_TASKS: Record<string, TaskId> = { marta: 'craft', iuri: 'guard', lena: 'clean' };

export function createShelter(seed: number, nowMs: number): ShelterState {
  const s: ShelterState = {
    version: 1,
    seed,
    rng: seed | 0 || 1,
    hour: START_HOUR,
    lastRealMs: nowMs,
    lastSeenHour: START_HOUR,
    resources: {
      water: 8, dirtyWater: 0, food: 8, meds: 1, bandages: 2, scrap: 4, wood: 6,
      parts: 1, components: 0, fuel: 0, ammo: 0, weapons: 1, waste: 2,
    },
    buildings: { workbench: 0, rainCollector: 0, filter: 0, stove: 0, garden: 0, bed: 1, latrine: 0, barricade: 0 },
    project: null,
    survivors: SURVIVORS.map((d) => ({
      id: d.id,
      name: d.name,
      bio: d.bio,
      traits: [...d.traits],
      health: 100,
      hunger: 20,
      thirst: 20,
      fatigue: 10,
      mood: 60,
      sick: false,
      task: STARTING_TASKS[d.id] ?? 'rest',
      status: 'home',
      expeditionId: null,
      talkedDay: 0,
      brokenHours: 0,
      raidDay: 0,
    })),
    expeditions: [],
    dilemmas: [],
    diary: [],
    rationing: false,
    raining: false,
    gardenProgress: 0,
    gardenWatered: false,
    locationStock: Object.fromEntries(LOCATIONS.map((l) => [l.id, 100])),
    banditThreat: 0,
    usedRecruits: [],
    nextId: 1,
    discovered: LOCATIONS.filter((l) => l.known).map((l) => l.id),
    seenResources: null,
    seenAlive: [],
    activeRaid: null,
    mapsFound: [],
    standing: null,
    buildQueue: [],
  };
  log(s, 'Dia 1. Uma casa de dois andares com muro alto. Três pessoas, pouca água, nenhum plano.');
  log(s, 'Comece pela bancada: sem ela, quase nada se constrói.');
  return s;
}

/** Saves antigos não têm os campos da Fase 3. */
export function migrate(s: ShelterState): ShelterState {
  s.discovered ??= LOCATIONS.filter((l) => l.known).map((l) => l.id);
  s.seenResources ??= null;
  s.seenAlive ??= [];
  s.activeRaid ??= null;
  s.mapsFound ??= [];
  s.standing ??= null;
  s.buildQueue ??= [];
  for (const v of s.survivors) v.raidDay ??= 0;
  for (const e of s.expeditions) {
    e.emergency ??= null;
    if (e.emergency) e.emergency.deadline ??= e.returnHour;
  }
  return s;
}

/** O jogador está olhando: guarda a foto para o saldo do próximo relatório. */
export function markSeen(s: ShelterState): void {
  s.lastSeenHour = s.hour;
  s.seenResources = { ...s.resources };
  s.seenAlive = aliveSurvivors(s).map((v) => v.id);
}

/** Um mapa rabiscado revela o próximo local desconhecido. Devolve o nome, ou null se todos já são conhecidos. */
export function revealLocation(s: ShelterState): string | null {
  const next = LOCATIONS.find((l) => !s.discovered.includes(l.id));
  if (!next) return null;
  s.discovered.push(next.id);
  log(s, `🗺️ O mapa rabiscado mostra o caminho até ${next.name}. Agora dá para mandar gente para lá.`, 'good');
  return next.name;
}

export function hasUndiscovered(s: ShelterState): boolean {
  return LOCATIONS.some((l) => !s.discovered.includes(l.id));
}

export function isGameOver(s: ShelterState): boolean {
  return aliveSurvivors(s).length === 0;
}

/** Avança a simulação até o momento real `nowMs`. Devolve quantas horas de jogo passaram. */
export function advanceTo(s: ShelterState, nowMs: number, msPerHour = REAL_MS_PER_GAME_HOUR): number {
  const elapsed = nowMs - s.lastRealMs;
  if (elapsed < msPerHour) return 0;
  let n = Math.floor(elapsed / msPerHour);
  if (n > MAX_CATCHUP_HOURS) {
    n = MAX_CATCHUP_HOURS;
    s.lastRealMs = nowMs;
  } else {
    s.lastRealMs += n * msPerHour;
  }
  for (let i = 0; i < n && !isGameOver(s); i++) tickHour(s);
  return n;
}

export function tickHour(s: ShelterState): void {
  s.hour++;
  const h = hourOfDay(s.hour);
  const night = isNight(h);

  if (h === 0) newDay(s);
  if (h === 6) waterGarden(s);
  if (s.hour - s.lastSeenHour === DORMANT_AFTER) {
    log(s, 'Faz um dia que ninguém decide nada. O grupo aperta o cinto e espera: meia porção para todos.', 'warn');
  }
  if (h === 20) runStandingOrder(s);
  processExpeditions(s);
  startQueuedProject(s);

  const home = homeSurvivors(s);
  passiveProduction(s, home.length, h);
  home.forEach((v, i) => {
    updateNeeds(s, v, night, i < s.buildings.bed);
    if (!night) work(s, v);
  });
  if (h === 8 || h === 19) drink(s);
  if (h === 19) eat(s);
  if (h === 8) morningCare(s);
  if (h === 6) desertions(s);

  for (const v of homeSurvivors(s)) {
    if (v.health <= 0) die(s, v, `${v.name} morreu. ${v.hunger >= 80 ? 'De fome.' : v.thirst >= 80 ? 'De sede.' : v.sick ? 'A doença venceu.' : ''}`);
  }
  if (night) nightAttack(s, h);
  expireDilemmas(s);
  maybeSpawnVisitor(s, h);
}

function newDay(s: ShelterState): void {
  s.raining = chance(s, 0.35);
  for (const id of Object.keys(s.locationStock)) s.locationStock[id] = Math.min(100, s.locationStock[id] + 6);
  log(s, `Dia ${dayOf(s.hour)}.${s.raining ? ' Chove.' : ''}`);
}

function waterGarden(s: ShelterState): void {
  const need = s.buildings.garden;
  if (!need) return;
  if (s.resources.water >= need) {
    s.resources.water -= need;
    s.gardenWatered = true;
  } else if (s.resources.dirtyWater >= need) {
    s.resources.dirtyWater -= need;
    s.gardenWatered = true;
  } else {
    s.gardenWatered = false;
    log(s, 'Sem água para a horta hoje.', 'warn');
  }
}

function passiveProduction(s: ShelterState, people: number, h: number): void {
  s.resources.dirtyWater += 0.2 * s.buildings.rainCollector * (s.raining ? 3 : 1);
  if (s.buildings.filter && h % 2 === 0 && s.resources.dirtyWater >= 1) {
    s.resources.dirtyWater -= 1;
    s.resources.water += 1;
  }
  s.resources.waste += (people / 12) * (s.buildings.latrine ? 0.5 : 1);
}

function updateNeeds(s: ShelterState, v: ShelterSurvivor, night: boolean, hasBed: boolean): void {
  // Em modo de espera o grupo se poupa: fome e sede crescem mais devagar.
  const pace = isDormant(s) ? 0.6 : 1;
  v.hunger = clamp(v.hunger + 2.4 * pace);
  v.thirst = clamp(v.thirst + 2.2 * pace);
  const sleeping = night && v.task !== 'guard';
  if (sleeping) v.fatigue = clamp(v.fatigue - (hasBed ? 10 : 6));
  else if (!night && v.task === 'rest') v.fatigue = clamp(v.fatigue - 3);
  else v.fatigue = clamp(v.fatigue + 2.5);

  let dh = 0;
  if (v.hunger >= 80) dh -= 0.7;
  if (v.thirst >= 80) dh -= 1.5;
  if (v.sick) dh -= 0.5;
  if (dh === 0 && v.hunger < 60 && v.thirst < 60) dh = sleeping ? 0.8 : 0.4;
  v.health = clamp(v.health + dh);

  const waste = s.resources.waste;
  if (!v.sick && waste > 8 && chance(s, (waste - 8) * 0.003)) {
    v.sick = true;
    log(s, `${v.name} acordou com febre. O lixo acumulado não ajuda.`, 'warn');
  } else if (v.sick && chance(s, 0.015)) {
    v.sick = false;
    log(s, `${v.name} se recuperou da doença.`, 'good');
  }

  let target = 55;
  if (s.buildings.stove) target += 5;
  if (hasBed) target += 5;
  if (s.buildings.garden) target += 2;
  if (waste > 12) target -= 10;
  if (v.hunger > 70) target -= 10;
  if (v.thirst > 70) target -= 10;
  if (v.sick) target -= 8;
  if (v.fatigue > 80) target -= 6;
  v.mood = clamp(v.mood + (target - v.mood) * 0.03);
  v.brokenHours = emotionOf(v.mood) === 'quebrado' ? v.brokenHours + 1 : 0;
}

export function workEfficiency(v: ShelterSurvivor): number {
  const emo = emotionOf(v.mood);
  if (emo === 'quebrado' || v.fatigue >= 90) return 0;
  return (emo === 'deprimido' ? 0.5 : 1) * (v.fatigue > 70 ? 0.5 : 1);
}

function work(s: ShelterState, v: ShelterSurvivor): void {
  const eff = workEfficiency(v);
  if (eff === 0) return;
  switch (v.task) {
    case 'craft': {
      const p = s.project;
      if (!p) return;
      const def = RECIPES[p.recipe];
      if (def.needsWorkbench && !s.buildings.workbench) return;
      p.progress += eff * (v.traits.includes('mecanico') ? 1.5 : 1);
      if (p.progress >= def.hours) {
        if (p.recipe === 'weapon') s.resources.weapons += 1;
        else s.buildings[p.recipe]++;
        s.project = null;
        log(s, `${def.icon} ${def.name} pronto(a). Obra de ${v.name}.`, 'good');
      }
      return;
    }
    case 'garden':
      if (!s.buildings.garden || !s.gardenWatered) return;
      s.gardenProgress += eff * s.buildings.garden;
      while (s.gardenProgress >= 4) {
        s.gardenProgress -= 4;
        s.resources.food += 1;
      }
      return;
    case 'clean':
      s.resources.waste = Math.max(0, s.resources.waste - 0.6 * eff);
      return;
    case 'rest':
      v.mood = clamp(v.mood + 0.3);
      return;
    case 'guard':
      return;
  }
}

function drink(s: ShelterState): void {
  const amount = (s.rationing ? 0.5 : 1) * (isDormant(s) ? 0.5 : 1);
  const relief = s.rationing ? 30 : 50;
  const thirsty: string[] = [];
  for (const v of homeSurvivors(s)) {
    if (s.resources.water >= amount) {
      s.resources.water -= amount;
    } else if (s.resources.dirtyWater >= amount) {
      s.resources.dirtyWater -= amount;
      if (!v.sick && chance(s, 0.3)) {
        v.sick = true;
        log(s, `${v.name} bebeu água suja e passou mal.`, 'warn');
      }
    } else {
      thirsty.push(v.name);
      continue;
    }
    v.thirst = clamp(v.thirst - relief);
  }
  if (thirsty.length) log(s, `Não houve água para ${thirsty.join(', ')}.`, 'bad');
}

function eat(s: ShelterState): void {
  const cost = (s.buildings.stove ? 0.6 : 1) * (s.rationing ? 0.5 : 1) * (isDormant(s) ? 0.5 : 1);
  const relief = s.rationing ? 40 : 70;
  const hungry: ShelterSurvivor[] = [];
  for (const v of homeSurvivors(s)) {
    if (s.resources.food < cost) {
      hungry.push(v);
      continue;
    }
    s.resources.food -= cost;
    v.hunger = clamp(v.hunger - relief);
    v.mood = clamp(v.mood + (s.buildings.stove ? 2 : 0) - (s.rationing ? 1 : 0));
  }
  if (hungry.length) {
    for (const v of hungry) v.mood = clamp(v.mood - 6);
    log(s, `Ninguém jantou: ${hungry.map((v) => v.name).join(', ')}.`, 'bad');
  }
}

function morningCare(s: ShelterState): void {
  for (const v of homeSurvivors(s)) {
    if (v.sick && s.resources.meds >= 1) {
      s.resources.meds -= 1;
      v.sick = false;
      log(s, `${v.name} tomou remédio e melhorou.`, 'good');
    }
    if (v.health < 60 && s.resources.bandages >= 1) {
      s.resources.bandages -= 1;
      v.health = clamp(v.health + 20);
    }
  }
}

function desertions(s: ShelterState): void {
  for (const v of homeSurvivors(s)) {
    if (v.brokenHours < 24 || !chance(s, 0.3)) continue;
    v.status = 'gone';
    v.expeditionId = null;
    addResources(s, { food: 1, water: 1 }, -1);
    log(s, `${v.name} foi embora antes do amanhecer, levando um pouco de comida. Deixou um bilhete: "desculpa".`, 'bad');
    changeMood(s, -8, v);
  }
}

function nightAttack(s: ShelterState, h: number): void {
  if (![23, 0, 1, 2, 3].includes(h)) return;
  const forced = s.banditThreat > 0 && h === 1;
  const p = Math.max(0.004, 0.012 + s.resources.waste * 0.001 - s.buildings.barricade * 0.004);
  if (!forced && !chance(s, p)) return;

  const home = homeSurvivors(s);
  if (!home.length) return;
  const strength = randInt(s, 1, 4) + Math.floor(dayOf(s.hour) / 5) + s.banditThreat;
  s.banditThreat = 0;
  const guards = home.filter((v) => v.task === 'guard' && emotionOf(v.mood) !== 'quebrado');
  let defense = guards.length * 2 + Math.min(s.resources.weapons, guards.length) + s.buildings.barricade * 2;
  if (guards.length && s.resources.ammo >= 2) {
    s.resources.ammo -= 2;
    defense += 2;
  }

  if (defense >= strength) {
    for (const g of guards) g.mood = clamp(g.mood + 5);
    log(s, `Saqueadores tentaram entrar de madrugada. ${guards.map((g) => g.name).join(' e ') || 'A barricada'} os ${guards.length ? 'expulsaram' : 'segurou'}.`, 'good');
    if (guards.length && chance(s, 0.25)) {
      const g = pick(s, guards);
      g.health = clamp(g.health - 20);
      log(s, `${g.name} se machucou na briga.`, 'warn');
    }
    return;
  }

  const stealable: ResourceId[] = ['food', 'water', 'meds', 'scrap', 'wood', 'parts', 'fuel', 'ammo'];
  const stolen: Partial<Record<ResourceId, number>> = {};
  for (let i = 0; i < (strength - defense) * 2; i++) {
    const options = stealable.filter((r) => s.resources[r] >= 1);
    if (!options.length) break;
    const r = pick(s, options);
    s.resources[r] -= 1;
    stolen[r] = (stolen[r] ?? 0) + 1;
  }
  const what = (Object.keys(stolen) as ResourceId[]).map((r) => `${stolen[r]} ${RESOURCES[r].name.toLowerCase()}`).join(', ');
  log(s, `Invadiram o abrigo durante a noite${what ? ` e levaram: ${what}` : ''}.`, 'bad');
  changeMood(s, -8);
  if (chance(s, 0.5)) {
    const victim = pick(s, home);
    victim.health = clamp(victim.health - randInt(s, 15, 35));
    log(s, `${victim.name} foi espancado(a) por tentar impedir.`, 'bad');
  }
}

// ---------- Comandos do jogador ----------

export function setTask(s: ShelterState, id: string, task: TaskId): void {
  const v = s.survivors.find((x) => x.id === id);
  if (v && v.status === 'home') v.task = task;
}

export function talk(s: ShelterState, id: string): boolean {
  const v = s.survivors.find((x) => x.id === id);
  const day = dayOf(s.hour);
  if (!v || v.status !== 'home' || v.talkedDay === day) return false;
  v.talkedDay = day;
  const emo = emotionOf(v.mood);
  v.mood = clamp(v.mood + (emo === 'quebrado' || emo === 'deprimido' ? 15 : 8));
  log(s, `Você sentou e conversou com ${v.name} por um tempo.`, 'good');
  return true;
}

export function startProject(s: ShelterState, recipe: RecipeId): string | null {
  const def = RECIPES[recipe];
  if (s.project) return 'Já existe um projeto em andamento.';
  if (recipe !== 'weapon' && s.buildings[recipe] >= def.max) return 'Limite atingido.';
  if (def.needsWorkbench && !s.buildings.workbench) return 'Precisa de uma bancada.';
  if (!canAfford(s, def.cost)) return 'Faltam materiais.';
  addResources(s, def.cost, -1);
  s.project = { recipe, progress: 0 };
  log(s, `Começaram a construir: ${def.name}.`);
  return null;
}

export function cancelProject(s: ShelterState): void {
  if (!s.project) return;
  addResources(s, RECIPES[s.project.recipe].cost);
  log(s, `Projeto cancelado: ${RECIPES[s.project.recipe].name}. Materiais devolvidos.`);
  s.project = null;
}

export function setRationing(s: ShelterState, on: boolean): void {
  s.rationing = on;
  log(s, on ? 'Racionamento: meia porção para todos.' : 'Fim do racionamento.', on ? 'warn' : 'info');
}

/** Vida da incursão (1–3) a partir da saúde do abrigo. */
export function raidHp(v: ShelterSurvivor): number {
  return Math.max(1, Math.min(3, Math.ceil(v.health / 34)));
}

export interface RaidOutcome {
  status: 'extracted' | 'dead';
  items: ItemId[];
  hpLost: number;
  kills: number;
}

/**
 * Aplica o resultado de uma incursão ativa. `carried` é o equipamento que saiu do
 * abrigo: volta para o estoque, mas não conta como achado.
 */
export function applyRaidResult(s: ShelterState, id: string, r: RaidOutcome, locationId = 'market', carried: readonly ItemId[] = []): void {
  const v = s.survivors.find((x) => x.id === id);
  if (!v || v.status !== 'home') return;
  const loc = locationById(locationId);
  if (r.status === 'dead') {
    die(s, v, `${v.name} entrou em ${loc.name} e não saiu mais.`);
    return;
  }
  const loot = r.items.filter((it) => it !== 'map_note');
  for (const it of loot) addResources(s, ITEM_TO_RESOURCES[it]);
  const found: ItemId[] = [...loot];
  for (const it of carried) {
    const k = found.indexOf(it);
    if (k >= 0) found.splice(k, 1);
  }
  s.locationStock[loc.id] = Math.max(10, (s.locationStock[loc.id] ?? 100) - found.length * 3);
  v.health = clamp(v.health - r.hpLost * 25);
  v.fatigue = clamp(v.fatigue + 20);
  const value = found.reduce((sum, it) => sum + ITEMS[it].value, 0);
  if (value >= 10) changeMood(s, 4);
  log(
    s,
    found.length
      ? `${v.name} voltou de ${loc.name} com ${summarize(found)}.${r.hpLost ? ' Ferido(a).' : ''}`
      : `${v.name} voltou de ${loc.name} sem nada.`,
    found.length ? 'good' : 'warn',
  );
  if (r.items.includes('map_note') && !s.mapsFound.includes(loc.id)) {
    s.mapsFound.push(loc.id);
    revealLocation(s);
  }
}

// ---------- Ordens permanentes ----------

export function setStanding(s: ShelterState, order: StandingOrder | null): string | null {
  if (!order) {
    if (s.standing) log(s, 'Ordem permanente cancelada.');
    s.standing = null;
    return null;
  }
  if (!s.discovered.includes(order.locationId)) return 'Ninguém sabe o caminho até esse lugar ainda.';
  const ids = [...new Set(order.ids)].filter((id) => aliveSurvivors(s).some((v) => v.id === id));
  if (ids.length < 1 || ids.length > 2) return 'Escolha 1 ou 2 sobreviventes.';
  if (!(order.risk in RISK_RULES)) return 'Regra de risco desconhecida.';
  s.standing = { locationId: order.locationId, ids, risk: order.risk };
  const names = ids.map((id) => s.survivors.find((v) => v.id === id)!.name).join(' e ');
  log(s, `Ordem permanente: ${names} ${ids.length > 1 ? 'vão' : 'vai'} para ${locationById(order.locationId).name} toda noite.`);
  return null;
}

function runStandingOrder(s: ShelterState): void {
  const o = s.standing;
  if (!o) return;
  const alive = o.ids.filter((id) => aliveSurvivors(s).some((v) => v.id === id));
  if (!alive.length) {
    s.standing = null;
    log(s, 'A ordem permanente acabou: não sobrou ninguém para cumpri-la.', 'warn');
    return;
  }
  const fit = alive.filter((id) => {
    const v = s.survivors.find((x) => x.id === id)!;
    return v.status === 'home' && v.expeditionId === null && v.health > 50 && !v.sick && emotionOf(v.mood) !== 'quebrado';
  });
  if (!fit.length) {
    log(s, `Ordem permanente: ninguém em condições de ir para ${locationById(o.locationId).name} esta noite.`, 'warn');
    return;
  }
  sendExpedition(s, o.locationId, fit, o.risk);
}

export const MAX_BUILD_QUEUE = 6;

export function queueProject(s: ShelterState, recipe: RecipeId): string | null {
  if (!(recipe in RECIPES)) return 'Receita desconhecida.';
  if (s.buildQueue.length >= MAX_BUILD_QUEUE) return 'A fila está cheia.';
  s.buildQueue.push(recipe);
  return null;
}

export function unqueueProject(s: ShelterState, index: number): void {
  if (Number.isInteger(index) && index >= 0 && index < s.buildQueue.length) s.buildQueue.splice(index, 1);
}

function startQueuedProject(s: ShelterState): void {
  if (s.project || !s.buildQueue.length) return;
  const error = startProject(s, s.buildQueue[0]);
  // Começou, ou nunca vai poder (limite atingido): sai da fila. Senão, espera material.
  if (error === null || error === 'Limite atingido.') s.buildQueue.shift();
}

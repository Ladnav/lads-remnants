import { ITEMS, type ItemId } from '../../data/items';
import type { SurvivorDef, TraitId } from '../../data/survivors';
import { ZOMBIES } from '../../data/zombies';
import { chance, nextRandom, pick, type RngState } from '../rng';
import {
  DIRS,
  bfsDistances,
  chebyshev,
  idx,
  inBounds,
  isWalkableForPath,
  lineOfSight,
  manhattan,
  tileAt,
} from './grid';
import { generateSite, rollZombieKind, type SiteOptions } from './mapgen';
import type { Action, Container, EventTone, Noise, RaidEvent, RaidState, Vec, Zombie } from './types';

export const VIEW_RADIUS = 7;
export const ZOMBIE_SIGHT = 6;
const BASE_CAPACITY = 10;
const STRONG_CAPACITY = 14;

const NOISE = {
  step: 2,
  quietStep: 1,
  door: 1,
  search: 1,
  pick: 1,
  attack: 4,
  force: 8,
  forceCrowbar: 5,
  bash: 3,
  rock: 5,
} as const;

export const START_ROCKS = 2;
export const THROW_RANGE = 6;

export interface RaidOptions extends SiteOptions {
  site?: string;
  startHp?: number;
  /** Expedição em apuros: a horda já está acordada e vindo. */
  emergency?: boolean;
  /** Equipamento trazido do abrigo: já começa na mochila. */
  startItems?: ItemId[];
}

export function createRaid(seed: number, def: SurvivorDef, opts: RaidOptions = {}): RaidState {
  const r: RngState = { rng: seed | 0 || 1 };
  const map = generateSite(r, opts);
  const startHp = opts.startHp ?? def.maxHp;
  const state: RaidState = {
    seed,
    site: opts.site ?? 'Mercado Bom Preço',
    emergency: !!opts.emergency,
    rocks: START_ROCKS,
    specials: opts.specials ?? 0,
    rng: r.rng,
    turn: 0,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    seen: new Array(map.width * map.height).fill(false),
    player: map.start,
    survivor: { id: def.id, name: def.name, traits: [...def.traits], hp: Math.min(startHp, def.maxHp), maxHp: def.maxHp },
    backpack: [...(opts.startItems ?? [])],
    containers: map.containers,
    zombies: map.zombies,
    exits: map.exits,
    spawns: map.spawns,
    nextZombieId: map.zombies.length,
    nextSpawnTurn: 8,
    pendingNoises: [],
    lastNoises: [],
    kills: 0,
    status: 'active',
    log: [],
  };
  if (opts.emergency) {
    state.nextSpawnTurn = 3;
    for (const z of state.zombies) {
      z.state = 'investigating';
      z.target = { ...state.player };
    }
    const roof = state.exits.find((e) => e.id === 'roof');
    if (roof) {
      roof.opensAt = 6;
      roof.closesAt = 20;
    }
  }
  updateSeen(state);
  return state;
}

/** Reproduz uma incursão inteira a partir da semente e do log de ações (base da validação no servidor). */
export function replay(seed: number, def: SurvivorDef, actions: readonly Action[], opts: RaidOptions = {}): RaidState {
  const state = createRaid(seed, def, opts);
  for (const a of actions) applyAction(state, a);
  return state;
}

export function hasTrait(state: RaidState, t: TraitId): boolean {
  return state.survivor.traits.includes(t);
}

export function capacity(state: RaidState): number {
  return hasTrait(state, 'forte') ? STRONG_CAPACITY : BASE_CAPACITY;
}

export function carriedWeight(state: RaidState): number {
  return state.backpack.reduce((sum, id) => sum + ITEMS[id].weight, 0);
}

export function lootValue(items: readonly ItemId[]): number {
  return items.reduce((sum, id) => sum + ITEMS[id].value, 0);
}

export function hasCrowbar(state: RaidState): boolean {
  return state.backpack.includes('crowbar');
}

export function exitStatus(state: RaidState, exitId: string): 'open' | 'soon' | 'closed' {
  const e = state.exits.find((x) => x.id === exitId);
  if (!e) return 'closed';
  if (state.turn < e.opensAt) return 'soon';
  if (e.closesAt !== null && state.turn > e.closesAt) return 'closed';
  return 'open';
}

export function exitAt(state: RaidState, pos: Vec) {
  const t = tileAt(state, pos.x, pos.y);
  return t?.kind === 'exit' ? state.exits.find((e) => e.id === t.exitId) : undefined;
}

export function zombieAt(state: RaidState, x: number, y: number): Zombie | undefined {
  return state.zombies.find((z) => z.pos.x === x && z.pos.y === y);
}

export function adjacentContainers(state: RaidState): Container[] {
  return state.containers.filter((c) => chebyshev(c.pos, state.player) === 1);
}

export function adjacentLockedDoors(state: RaidState): Vec[] {
  const out: Vec[] = [];
  for (const d of DIRS) {
    const x = state.player.x + d.x;
    const y = state.player.y + d.y;
    const t = tileAt(state, x, y);
    if (t?.kind === 'door' && t.door === 'locked') out.push({ x, y });
  }
  return out;
}

export function computeVisible(state: RaidState): boolean[] {
  const vis = new Array<boolean>(state.width * state.height).fill(false);
  const p = state.player;
  for (let y = p.y - VIEW_RADIUS; y <= p.y + VIEW_RADIUS; y++) {
    for (let x = p.x - VIEW_RADIUS; x <= p.x + VIEW_RADIUS; x++) {
      if (!inBounds(state, x, y)) continue;
      const dx = x - p.x;
      const dy = y - p.y;
      if (dx * dx + dy * dy > VIEW_RADIUS * VIEW_RADIUS + 1) continue;
      if (lineOfSight(state, p, { x, y })) vis[idx(state, x, y)] = true;
    }
  }
  return vis;
}

function updateSeen(state: RaidState): void {
  const vis = computeVisible(state);
  for (let i = 0; i < vis.length; i++) if (vis[i]) state.seen[i] = true;
}

/** Aplica uma ação do jogador (mutando o estado) e devolve os eventos para o log da interface. */
export function applyAction(state: RaidState, action: Action): RaidEvent[] {
  if (state.status !== 'active') return [];
  state.log.push(action);
  state.lastNoises = [];
  const ev: RaidEvent[] = [];
  const say = (text: string, tone: EventTone = 'info') => ev.push({ text, tone });

  const costsTurn = action.type !== 'take' && action.type !== 'drop';
  if (costsTurn && panics(state)) {
    say(`${state.survivor.name} trava de medo e não consegue se mexer!`, 'bad');
    endTurn(state, ev, []);
    return ev;
  }

  switch (action.type) {
    case 'move':
      doMove(state, action.dx, action.dy, say, ev);
      break;
    case 'wait':
      endTurn(state, ev, []);
      break;
    case 'search': {
      const c = state.containers[action.containerId];
      if (!c || c.searched || chebyshev(c.pos, state.player) !== 1) break;
      c.searched = true;
      say(
        c.items.length
          ? `${c.name}: ${c.items.map((i) => ITEMS[i].name).join(', ')}.`
          : `${c.name}: vazio. Alguém passou aqui antes.`,
        c.items.length ? 'good' : 'info',
      );
      // Procurar leva 2 turnos.
      endTurn(state, ev, [{ pos: { ...state.player }, radius: NOISE.search }]);
      if (state.status === 'active') endTurn(state, ev, []);
      break;
    }
    case 'take': {
      const c = state.containers[action.containerId];
      if (!c || !c.searched || chebyshev(c.pos, state.player) !== 1) break;
      const item = c.items[action.index];
      if (!item) break;
      if (carriedWeight(state) + ITEMS[item].weight > capacity(state)) {
        say('A mochila está pesada demais para isso.', 'warn');
        break;
      }
      c.items.splice(action.index, 1);
      state.backpack.push(item);
      break;
    }
    case 'drop': {
      const item = state.backpack[action.index];
      if (!item) break;
      state.backpack.splice(action.index, 1);
      say(`Você larga: ${ITEMS[item].name}.`);
      break;
    }
    case 'use': {
      const item = state.backpack[action.index];
      if (item !== 'bandage' || state.survivor.hp >= state.survivor.maxHp) break;
      state.backpack.splice(action.index, 1);
      state.survivor.hp++;
      say('Você faz um curativo rápido.', 'good');
      endTurn(state, ev, []);
      break;
    }
    case 'pick': {
      const t = tileAt(state, action.x, action.y);
      if (t?.kind !== 'door' || t.door !== 'locked' || manhattan(state.player, action) !== 1) break;
      const turns = hasTrait(state, 'mecanico') ? 1 : 3;
      say(turns === 1 ? 'Você abre a fechadura num instante.' : 'Você trabalha na fechadura com cuidado…');
      for (let i = 0; i < turns && state.status === 'active'; i++) {
        endTurn(state, ev, [{ pos: { ...state.player }, radius: NOISE.pick }]);
      }
      if (state.status === 'active') t.door = 'open';
      break;
    }
    case 'force': {
      const t = tileAt(state, action.x, action.y);
      if (t?.kind !== 'door' || t.door !== 'locked' || manhattan(state.player, action) !== 1) break;
      const crowbar = hasCrowbar(state);
      const ok = crowbar || chance(state, 0.6);
      if (ok) {
        t.door = 'broken';
        say(crowbar ? 'O pé de cabra arrebenta a porta. CRAC!' : 'Você arromba a porta no ombro. BAM!', 'warn');
      } else {
        say('A porta aguenta. Barulho à toa.', 'warn');
      }
      state.nextSpawnTurn = Math.max(state.turn + 1, state.nextSpawnTurn - 2);
      endTurn(state, ev, [{ pos: { ...action }, radius: crowbar ? NOISE.forceCrowbar : NOISE.force }]);
      break;
    }
    case 'throw': {
      if (!canThrowAt(state, action)) break;
      state.rocks--;
      say('A pedra quica lá longe. Cabeças se viram para o barulho.', 'info');
      endTurn(state, ev, [{ pos: { x: action.x, y: action.y }, radius: NOISE.rock }]);
      break;
    }
    case 'extract': {
      const e = exitAt(state, state.player);
      if (!e) break;
      if (exitStatus(state, e.id) !== 'open') {
        say(`${e.name} não está acessível agora.`, 'warn');
        break;
      }
      state.status = 'extracted';
      say(`${state.survivor.name} escapa pela ${e.name.toLowerCase()} com ${state.backpack.length} itens.`, 'good');
      break;
    }
  }
  return ev;
}

function doMove(
  state: RaidState,
  dx: number,
  dy: number,
  say: (t: string, tone?: EventTone) => void,
  ev: RaidEvent[],
): void {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  const t = tileAt(state, nx, ny);
  if (!t || t.kind === 'wall' || t.containerId !== undefined) return;

  const z = zombieAt(state, nx, ny);
  if (z) {
    attackZombie(state, z, say);
    endTurn(state, ev, [{ pos: { ...state.player }, radius: NOISE.attack }]);
    return;
  }

  if (t.kind === 'door' && t.door === 'locked') {
    say('Trancada. Arrombe a fechadura (P) ou force a porta (F).', 'warn');
    return;
  }
  if (t.kind === 'door' && t.door === 'closed') {
    t.door = 'open';
    endTurn(state, ev, [{ pos: { x: nx, y: ny }, radius: NOISE.door }]);
    return;
  }

  state.player = { x: nx, y: ny };
  const radius = hasTrait(state, 'silencioso') ? NOISE.quietStep : NOISE.step;
  endTurn(state, ev, [{ pos: { ...state.player }, radius }]);
}

/** Dá para arremessar uma pedra ali? Precisa ver o lugar e ele estar a uma distância razoável. */
export function canThrowAt(state: RaidState, p: Vec): boolean {
  if (state.rocks <= 0 || !Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
  const t = tileAt(state, p.x, p.y);
  if (!t || t.kind === 'wall') return false;
  const d = manhattan(state.player, p);
  return d >= 2 && d <= THROW_RANGE && lineOfSight(state, state.player, p);
}

function attackZombie(state: RaidState, z: Zombie, say: (t: string, tone?: EventTone) => void): void {
  const hitChance = hasTrait(state, 'lutador') ? 0.9 : 0.7;
  z.state = 'chasing';
  z.target = { ...state.player };
  if (!chance(state, hitChance)) {
    say('Você erra o golpe.', 'warn');
    return;
  }
  z.hp -= hasCrowbar(state) ? 2 : 1;
  if (z.hp <= 0) {
    state.zombies = state.zombies.filter((o) => o !== z);
    state.kills++;
    say(`O ${ZOMBIES[z.kind].name} cai e não levanta mais.`, 'good');
  } else {
    say(`Você acerta o ${ZOMBIES[z.kind].name}. Ele ainda vem.`, 'info');
  }
}

function panics(state: RaidState): boolean {
  if (!hasTrait(state, 'medroso')) return false;
  const vis = computeVisible(state);
  const scary = state.zombies.some(
    (z) => vis[idx(state, z.pos.x, z.pos.y)] && manhattan(z.pos, state.player) <= 3,
  );
  return scary && chance(state, 0.2);
}

/** Espalha o ruído: zumbis no raio vão investigar a origem. */
export function propagateNoise(state: RaidState, noises: readonly Noise[]): void {
  for (const n of noises) {
    for (const z of state.zombies) {
      if (z.state !== 'chasing' && manhattan(z.pos, n.pos) <= n.radius) {
        z.state = 'investigating';
        z.target = { ...n.pos };
      }
    }
  }
}

function endTurn(state: RaidState, ev: RaidEvent[], noises: Noise[]): void {
  state.turn++;
  const all = [...state.pendingNoises, ...noises];
  state.pendingNoises = [];
  state.lastNoises.push(...all);
  propagateNoise(state, all);

  for (const z of [...state.zombies]) {
    if (state.status !== 'active') break;
    actZombie(state, z, ev);
  }

  if (state.status === 'active' && state.turn >= state.nextSpawnTurn) {
    spawnZombie(state, ev);
    state.nextSpawnTurn = state.turn + Math.max(3, 8 - Math.floor(state.turn / 8));
  }

  const roof = state.exits.find((e) => e.id === 'roof');
  if (roof && state.turn === roof.opensAt) {
    ev.push({ text: `A escada do telhado está livre — até o turno ${roof.closesAt}.`, tone: 'good' });
  }
  if (roof && roof.closesAt !== null && state.turn === roof.closesAt + 1) {
    ev.push({ text: 'Zumbis tomaram o telhado. Só resta a entrada.', tone: 'bad' });
  }
  updateSeen(state);
}

function actZombie(state: RaidState, z: Zombie, ev: RaidEvent[]): void {
  const d = manhattan(z.pos, state.player);
  const sees = d <= ZOMBIE_SIGHT && lineOfSight(state, z.pos, state.player);
  if (sees) {
    if (z.state !== 'chasing') ev.push({ text: `Um ${ZOMBIES[z.kind].name} te viu!`, tone: 'bad' });
    z.state = 'chasing';
    z.target = { ...state.player };
  } else if (z.state === 'chasing') {
    z.state = 'investigating';
  }

  if (z.state === 'chasing' && d === 1) {
    biteAttempt(state, z, ev);
    return;
  }

  if (z.state === 'idle') {
    if (chance(state, 0.15)) {
      const dir = pick(state, DIRS);
      tryStep(state, z, { x: z.pos.x + dir.x, y: z.pos.y + dir.y }, ev);
    }
    return;
  }

  z.moveAcc += z.state === 'chasing' ? ZOMBIES[z.kind].speed : Math.min(0.5, ZOMBIES[z.kind].speed);
  while (z.moveAcc >= 1 && z.target) {
    z.moveAcc -= 1;
    const next = nextStep(state, z.pos, z.target);
    if (!next) break;
    tryStep(state, z, next, ev);
    if (z.state === 'chasing' && manhattan(z.pos, state.player) === 1) break;
  }
  if (z.state === 'investigating' && z.target && z.pos.x === z.target.x && z.pos.y === z.target.y) {
    z.state = 'idle';
    z.target = null;
    z.moveAcc = 0;
  }
}

function biteAttempt(state: RaidState, z: Zombie, ev: RaidEvent[]): void {
  const def = ZOMBIES[z.kind];
  if (nextRandom(state) >= def.bite) {
    ev.push({ text: `Um ${def.name} avança, mas você se esquiva.`, tone: 'warn' });
    return;
  }
  state.survivor.hp--;
  if (state.survivor.hp <= 0) {
    state.status = 'dead';
    ev.push({ text: `${state.survivor.name} foi pego. Tudo o que carregava ficou para trás.`, tone: 'bad' });
  } else {
    ev.push({ text: `Um ${def.name} te morde! Você está ferido.`, tone: 'bad' });
  }
}

/** Primeiro passo do caminho mais curto de from até to (ou null). */
function nextStep(state: RaidState, from: Vec, to: Vec): Vec | null {
  const dist = bfsDistances(state, to, isWalkableForPath);
  let best: Vec | null = null;
  let bestD = dist[idx(state, from.x, from.y)];
  if (bestD < 0) return null;
  for (const d of DIRS) {
    const nx = from.x + d.x;
    const ny = from.y + d.y;
    if (!inBounds(state, nx, ny)) continue;
    const nd = dist[idx(state, nx, ny)];
    if (nd >= 0 && nd < bestD) {
      bestD = nd;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

function tryStep(state: RaidState, z: Zombie, to: Vec, ev: RaidEvent[]): void {
  const t = tileAt(state, to.x, to.y);
  if (!t || !isWalkableForPath(t) || t.kind === 'exit') return;
  if (t.kind === 'door' && (t.door === 'closed' || t.door === 'locked')) {
    t.bash = (t.bash ?? 0) + 1;
    state.pendingNoises.push({ pos: { ...to }, radius: NOISE.bash });
    if (t.bash >= 3) {
      t.door = 'broken';
      ev.push({ text: 'Uma porta cede com um estrondo em algum lugar.', tone: 'warn' });
    }
    return;
  }
  if (to.x === state.player.x && to.y === state.player.y) return;
  if (zombieAt(state, to.x, to.y)) return;
  z.pos = { ...to };
}

function spawnZombie(state: RaidState, ev: RaidEvent[]): void {
  const vis = computeVisible(state);
  const options = state.spawns.filter(
    (p) => !vis[idx(state, p.x, p.y)] && !zombieAt(state, p.x, p.y) && manhattan(p, state.player) > 3,
  );
  if (!options.length) return;
  const pos = pick(state, options);
  // A horda piora com o tempo: cada leva tem mais chance de trazer algo pior.
  const kind = rollZombieKind(state, Math.min(0.6, state.specials + state.turn / 150));
  state.zombies.push({
    id: state.nextZombieId++,
    kind,
    pos: { ...pos },
    hp: ZOMBIES[kind].hp,
    state: 'investigating',
    target: { ...state.player },
    moveAcc: 0,
  });
  ev.push({ text: 'Gemidos lá fora. Mais deles entraram.', tone: 'warn' });
}

import { CONTAINERS, type ItemId } from '../../data/items';
import { ZOMBIES, type ZombieKind } from '../../data/zombies';
import { chance, pick, randInt, type RngState } from '../rng';
import { DIRS, bfsDistances, idx, isWalkableForPath, type GridLike } from './grid';
import type { Container, DoorState, Exit, Tile, Vec, Zombie } from './types';

export const MAP_W = 28;
export const MAP_H = 20;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GeneratedMap {
  width: number;
  height: number;
  tiles: Tile[];
  containers: Container[];
  zombies: Zombie[];
  exits: Exit[];
  spawns: Vec[];
  start: Vec;
}

export const ROOF_OPENS_AT = 12;
export const ROOF_CLOSES_AT = 28;

export interface SiteOptions {
  /** Loot típico do local; metade dos itens vem daqui, metade do tipo de container. */
  loot?: readonly ItemId[];
  zombies?: [number, number];
  /** 0–1: quanto do loot ainda existe (estoque do local). Padrão 1. */
  lootScale?: number;
  /** 0–1: chance de cada zumbi ser corredor ou brutamontes. Padrão 0. */
  specials?: number;
  /** Esconde um mapa rabiscado num container (revela um novo local no abrigo). */
  mapNote?: boolean;
}

/** Gera um prédio abandonado: salas por BSP, portas (algumas trancadas), containers e zumbis. */
export function generateSite(r: RngState, opts: SiteOptions = {}): GeneratedMap {
  for (let attempt = 0; attempt < 100; attempt++) {
    const map = tryGenerate(r, opts);
    if (map) return map;
  }
  throw new Error('Falha ao gerar o mapa');
}

function tryGenerate(r: RngState, opts: SiteOptions): GeneratedMap | null {
  const width = MAP_W;
  const height = MAP_H;
  const tiles: Tile[] = Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    return { kind: border ? 'wall' : 'floor' };
  });
  const g: GridLike = { width, height, tiles };

  const rooms: Rect[] = [];
  split(r, g, { x0: 1, y0: 1, x1: width - 2, y1: height - 2 }, 0, rooms);

  // Entrada na parede de baixo.
  const ex = randInt(r, 4, width - 5);
  const start = { x: ex, y: height - 2 };
  if (tiles[idx(g, start.x, start.y)].kind !== 'floor') return null;
  tiles[idx(g, ex, height - 1)] = { kind: 'exit', exitId: 'entry' };

  // Containers: encostados em paredes, longe de portas e da entrada.
  const containers: Container[] = [];
  for (const room of rooms) {
    const wanted = randInt(r, 1, 3);
    for (let tries = 0; tries < 20 && countIn(containers, room) < wanted; tries++) {
      const x = randInt(r, room.x0, room.x1);
      const y = randInt(r, room.y0, room.y1);
      const t = tiles[idx(g, x, y)];
      if (t.kind !== 'floor' || t.containerId !== undefined) continue;
      if (Math.abs(x - start.x) + Math.abs(y - start.y) < 3) continue;
      const neighbours = DIRS.map((d) => tiles[idx(g, x + d.x, y + d.y)]);
      if (!neighbours.some((n) => n.kind === 'wall')) continue;
      if (neighbours.some((n) => n.kind === 'door' || n.kind === 'exit' || n.containerId !== undefined)) continue;
      const def = pick(r, CONTAINERS);
      const count = randInt(r, def.min, def.max);
      const scale = opts.lootScale ?? 1;
      const items = Array.from({ length: count }, () => pick(r, opts.loot && chance(r, 0.5) ? opts.loot : def.loot)).filter(
        () => scale >= 1 || chance(r, scale),
      );
      const id = containers.length;
      containers.push({ id, pos: { x, y }, name: def.name, searched: false, items });
      t.containerId = id;
    }
  }

  // Tudo precisa ser alcançável a partir da entrada.
  const dist = bfsDistances(g, start, isWalkableForPath);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if ((t.kind === 'floor' || t.kind === 'door') && t.containerId === undefined && dist[i] < 0) return null;
  }
  for (const c of containers) {
    const reachable = DIRS.some((d) => dist[idx(g, c.pos.x + d.x, c.pos.y + d.y)] >= 0);
    if (!reachable) return null;
  }

  // Saída temporária: o piso mais distante da entrada vira a escada do telhado.
  let far = -1;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].kind === 'floor' && tiles[i].containerId === undefined && (far < 0 || dist[i] > dist[far])) far = i;
  }
  if (far < 0 || dist[far] < 15) return null;
  const roof = { x: far % width, y: Math.floor(far / width) };
  tiles[far] = { kind: 'exit', exitId: 'roof' };

  const exits: Exit[] = [
    { id: 'entry', name: 'Entrada', pos: { x: ex, y: height - 1 }, opensAt: 0, closesAt: null },
    { id: 'roof', name: 'Escada do telhado', pos: roof, opensAt: ROOF_OPENS_AT, closesAt: ROOF_CLOSES_AT },
  ];

  const freeFloor = (minDist: number): Vec[] => {
    const out: Vec[] = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t.kind === 'floor' && t.containerId === undefined && dist[i] >= minDist) {
        out.push({ x: i % width, y: Math.floor(i / width) });
      }
    }
    return out;
  };

  // Janelas quebradas por onde a horda entra: piso junto à parede externa, longe da entrada.
  const spawnCandidates = freeFloor(10).filter(
    (p) => p.x === 1 || p.y === 1 || p.x === width - 2 || p.y === height - 2,
  );
  if (spawnCandidates.length < 3) return null;
  const spawns: Vec[] = [];
  while (spawns.length < 3) {
    const p = pick(r, spawnCandidates);
    if (!spawns.some((s) => s.x === p.x && s.y === p.y)) spawns.push(p);
  }

  const zombieSpots = freeFloor(8);
  const zombies: Zombie[] = [];
  const [zMin, zMax] = opts.zombies ?? [4, 6];
  const zCount = randInt(r, zMin, zMax);
  for (let tries = 0; tries < 50 && zombies.length < zCount; tries++) {
    const p = pick(r, zombieSpots);
    if (zombies.some((z) => z.pos.x === p.x && z.pos.y === p.y)) continue;
    const kind = rollZombieKind(r, opts.specials ?? 0);
    zombies.push({ id: zombies.length, kind, pos: p, hp: ZOMBIES[kind].hp, state: 'idle', target: null, moveAcc: 0 });
  }

  if (opts.mapNote) {
    // Fica num dos containers mais fundos do prédio: achar o caminho custa risco.
    const deep = [...containers].sort(
      (a, b) => Math.abs(b.pos.x - start.x) + Math.abs(b.pos.y - start.y) - (Math.abs(a.pos.x - start.x) + Math.abs(a.pos.y - start.y)),
    );
    pick(r, deep.slice(0, 3)).items.push('map_note');
  }

  return { width, height, tiles, containers, zombies, exits, spawns, start };
}

export function rollZombieKind(r: RngState, specials: number): ZombieKind {
  if (!chance(r, specials)) return 'walker';
  return chance(r, 0.5) ? 'runner' : 'brute';
}

function countIn(containers: Container[], room: Rect): number {
  return containers.filter(
    (c) => c.pos.x >= room.x0 && c.pos.x <= room.x1 && c.pos.y >= room.y0 && c.pos.y <= room.y1,
  ).length;
}

function makeDoor(r: RngState): Tile {
  const roll = randInt(r, 1, 100);
  const door: DoorState = roll <= 20 ? 'locked' : roll <= 45 ? 'open' : 'closed';
  return { kind: 'door', door };
}

function split(r: RngState, g: GridLike, rect: Rect, depth: number, rooms: Rect[]): void {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  const canV = w >= 9;
  const canH = h >= 8;
  if ((!canV && !canH) || depth >= 4 || (depth >= 2 && chance(r, 0.25))) {
    rooms.push(rect);
    return;
  }
  const vertical = canV && (!canH || chance(r, w > h ? 0.75 : 0.25));
  if (vertical) {
    const sx = randInt(r, rect.x0 + 3, rect.x1 - 3);
    for (let y = rect.y0; y <= rect.y1; y++) g.tiles[idx(g, sx, y)] = { kind: 'wall' };
    g.tiles[idx(g, sx, randInt(r, rect.y0, rect.y1))] = makeDoor(r);
    split(r, g, { ...rect, x1: sx - 1 }, depth + 1, rooms);
    split(r, g, { ...rect, x0: sx + 1 }, depth + 1, rooms);
  } else {
    const sy = randInt(r, rect.y0 + 3, rect.y1 - 3);
    for (let x = rect.x0; x <= rect.x1; x++) g.tiles[idx(g, x, sy)] = { kind: 'wall' };
    g.tiles[idx(g, randInt(r, rect.x0, rect.x1), sy)] = makeDoor(r);
    split(r, g, { ...rect, y1: sy - 1 }, depth + 1, rooms);
    split(r, g, { ...rect, y0: sy + 1 }, depth + 1, rooms);
  }
}

import type { Tile, Vec } from './types';

export const DIRS: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export interface GridLike {
  width: number;
  height: number;
  tiles: Tile[];
}

export function idx(g: { width: number }, x: number, y: number): number {
  return y * g.width + x;
}

export function inBounds(g: GridLike, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function tileAt(g: GridLike, x: number, y: number): Tile | undefined {
  return inBounds(g, x, y) ? g.tiles[idx(g, x, y)] : undefined;
}

export function manhattan(a: Vec, b: Vec): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isOpaque(t: Tile): boolean {
  return t.kind === 'wall' || (t.kind === 'door' && (t.door === 'closed' || t.door === 'locked'));
}

/** Pode ser atravessado por um caminho (portas contam, pois podem ser abertas ou derrubadas). */
export function isWalkableForPath(t: Tile): boolean {
  return t.kind !== 'wall' && t.containerId === undefined;
}

/** Bresenham: true se nada opaco existe entre a e b (as pontas não contam). */
export function lineOfSight(g: GridLike, a: Vec, b: Vec): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === b.x && y === b.y) break;
    if (isOpaque(g.tiles[idx(g, x, y)])) return false;
  }
  return true;
}

/** Distâncias BFS (4 direções) a partir de start; -1 = inalcançável. */
export function bfsDistances(g: GridLike, start: Vec, passable: (t: Tile) => boolean): Int32Array {
  const dist = new Int32Array(g.width * g.height).fill(-1);
  const queue: number[] = [idx(g, start.x, start.y)];
  dist[queue[0]] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % g.width;
    const cy = Math.floor(cur / g.width);
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (!inBounds(g, nx, ny)) continue;
      const ni = idx(g, nx, ny);
      if (dist[ni] !== -1 || !passable(g.tiles[ni])) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

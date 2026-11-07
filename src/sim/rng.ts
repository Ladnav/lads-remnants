// Mulberry32: RNG pequeno e determinístico. O estado vive num objeto serializável
// para que a mesma semente + as mesmas ações reproduzam a mesma partida (validação no servidor).
export interface RngState {
  rng: number;
}

export function nextRandom(s: RngState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextRandom(s) * (max - min + 1));
}

export function chance(s: RngState, p: number): boolean {
  return nextRandom(s) < p;
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  return arr[Math.floor(nextRandom(s) * arr.length)];
}

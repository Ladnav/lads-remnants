import type { ShelterState } from '../sim/shelter/types';

const SAVE_KEY = 'lads-remnants:save:v1';
const SPEED_KEY = 'lads-remnants:speed';

// Até a Fase 4 (Supabase), o abrigo vive no navegador.
export function loadSave(): ShelterState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ShelterState;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: ShelterState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Sem armazenamento (aba privada etc.): o jogo segue, só não persiste.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignorado
  }
}

/** Velocidade de depuração do relógio (1× = tempo real do jogo). */
export function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return [1, 60, 600].includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(v: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
  } catch {
    // ignorado
  }
}

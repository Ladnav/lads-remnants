import { migrate } from '../sim/shelter/shelter';
import type { ShelterState } from '../sim/shelter/types';

const SAVE_KEY = 'lads-remnants:save:v1';

// Até a Fase 4 (Supabase), o abrigo vive no navegador.
export function loadSave(): ShelterState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ShelterState;
    return s.version === 1 ? migrate(s) : null;
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

import { chance, pick } from '../rng';
import { addBond, clamp, homeSurvivors, isNight, log } from './core';
import type { ShelterState } from './types';

const QUARRELS = ['a divisão da comida', 'quem dorme perto da porta', 'um barulho à toa', 'o que fazer com os mortos', 'uma lata que sumiu'];
const MOMENTS = [
  'dividiram um cigarro velho no quintal',
  'riram de uma piada ruim até doer',
  'passaram a tarde lembrando de como era a cidade',
  'acharam um baralho incompleto e jogaram assim mesmo',
  'cantaram baixinho uma música que os dois sabiam',
];

/**
 * Laços entre quem está em casa: crescem com trabalho lado a lado e jantar na mesa,
 * azedam com fome e mau humor. Uma vez por dia, um par tem um momento bom ou uma briga.
 */
export function tickBonds(s: ShelterState, h: number): void {
  const home = homeSurvivors(s);
  if (home.length < 2) return;
  const pairs = home.flatMap((a, i) => home.slice(i + 1).map((b) => [a, b] as const));

  if (!isNight(h)) {
    for (const [a, b] of pairs) if (a.task === b.task && a.task !== 'rest') addBond(s, a.id, b.id, 0.4);
  }
  if (h === 20) {
    for (const [a, b] of pairs) {
      const fed = a.hunger < 60 && b.hunger < 60 && a.thirst < 60 && b.thirst < 60;
      addBond(s, a.id, b.id, fed ? 0.8 : -1.5);
    }
  }
  if (h === 13) {
    const a = pick(s, home);
    const b = pick(s, home.filter((x) => x !== a));
    if ((a.mood + b.mood) / 2 < 45) {
      if (!chance(s, 0.5)) return;
      log(s, `${a.name} e ${b.name} brigaram por causa de ${pick(s, QUARRELS)}.`, 'warn');
      a.mood = clamp(a.mood - 4);
      b.mood = clamp(b.mood - 4);
      addBond(s, a.id, b.id, -12);
    } else if (chance(s, 0.35)) {
      log(s, `${a.name} e ${b.name} ${pick(s, MOMENTS)}.`, 'good');
      a.mood = clamp(a.mood + 3);
      b.mood = clamp(b.mood + 3);
      addBond(s, a.id, b.id, 10);
    }
  }
}

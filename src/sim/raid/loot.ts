import { ITEMS, RARITIES, type ItemId, type Rarity } from '../../data/items';
import { nextRandom, pick, type RngState } from '../rng';

/**
 * Chance de cada raridade por nível do móvel (em %, soma 100): prateleira e balcão são N1, armário e
 * caixa de ferramentas N2, o cofre do local N3, e N4 fica para os locais secretos.
 */
export const TIER_TABLE: Record<1 | 2 | 3 | 4, Record<Rarity, number>> = {
  1: { comum: 80, incomum: 18, raro: 2, lendario: 0 },
  2: { comum: 55, incomum: 35, raro: 9, lendario: 1 },
  3: { comum: 20, incomum: 45, raro: 30, lendario: 5 },
  4: { comum: 0, incomum: 30, raro: 50, lendario: 20 },
};

/** Perigo do local: tira pontos de comum e põe em raro. */
const DANGER_SHIFT = { 1: 0, 2: 5, 3: 10 } as const;

export function rarityOdds(tier: 1 | 2 | 3 | 4, danger: 1 | 2 | 3): Record<Rarity, number> {
  const t = { ...TIER_TABLE[tier] };
  const shift = Math.min(DANGER_SHIFT[danger], t.comum);
  t.comum -= shift;
  t.raro += shift;
  return t;
}

export function rollRarity(r: RngState, tier: 1 | 2 | 3 | 4, danger: 1 | 2 | 3): Rarity {
  const odds = rarityOdds(tier, danger);
  let roll = nextRandom(r) * 100;
  for (const k of RARITIES) {
    roll -= odds[k];
    if (roll < 0) return k;
  }
  return 'comum';
}

const LOOTABLE = (Object.keys(ITEMS) as ItemId[]).filter((id) => !ITEMS[id].special);

/**
 * Um item: sorteia a raridade pelo nível do móvel e pelo perigo, e escolhe entre os itens dessa
 * raridade que combinam com o móvel e o local (`pools`). Se nenhum combina, qualquer um da raridade.
 */
export function rollItem(r: RngState, tier: 1 | 2 | 3 | 4, danger: 1 | 2 | 3, pools: readonly (readonly ItemId[])[]): ItemId {
  const rarity = rollRarity(r, tier, danger);
  const fitting = pools.flat().filter((id) => ITEMS[id].rarity === rarity && !ITEMS[id].special);
  return pick(r, fitting.length ? fitting : LOOTABLE.filter((id) => ITEMS[id].rarity === rarity));
}

/** A melhor raridade de uma lista (para a cor do ponto em cima do móvel). */
export function bestRarity(items: readonly ItemId[]): Rarity | null {
  let best = -1;
  for (const it of items) best = Math.max(best, RARITIES.indexOf(ITEMS[it].rarity));
  return best < 0 ? null : RARITIES[best];
}

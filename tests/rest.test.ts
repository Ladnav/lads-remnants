import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../src/data/shelter';
import { SURVIVORS } from '../src/data/survivors';
import { hourOfDay } from '../src/sim/shelter/core';
import { sendExpedition } from '../src/sim/shelter/expeditions';
import { createShelter, isRecovering, startProject, tickHour } from '../src/sim/shelter/shelter';
import { createRaid } from '../src/sim/raid/raid';
import { DIRS, bfsDistances, idx, isWalkableForPath } from '../src/sim/raid/grid';

describe('cansaço e descanso', () => {
  it('o vigia dorme de dia e não fica exausto para sempre', () => {
    const s = createShelter(5, 0);
    const iuri = s.survivors.find((v) => v.task === 'guard')!;
    for (let i = 0; i < 24 * 4; i++) tickHour(s);
    expect(iuri.fatigue).toBeLessThan(90);
  });

  it('quem volta da expedição dorme a manhã e depois volta a render na obra', () => {
    const s = createShelter(9, 0);
    while (hourOfDay(s.hour) !== 20) tickHour(s);
    const marta = s.survivors.find((v) => v.id === 'marta')!;
    expect(sendExpedition(s, 'market', ['marta'], 'cautious')).toBeNull();
    while (hourOfDay(s.hour) !== 7) tickHour(s);
    if (marta.status !== 'home') return; // não voltou: nada a testar nesta semente
    expect(isRecovering(s, marta)).toBe(true);
    s.resources.wood = 10;
    s.resources.scrap = 10;
    s.buildings.workbench = 1;
    expect(startProject(s, 'rainCollector')).toBeNull();
    while (hourOfDay(s.hour) !== 18) tickHour(s);
    expect(isRecovering(s, marta)).toBe(false);
    expect(marta.fatigue).toBeLessThan(90);
    expect(s.buildings.rainCollector).toBe(1);
  });
});

describe('chave do prêmio', () => {
  it('fica num dos móveis mais perto da entrada', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const loc = LOCATIONS[seed % LOCATIONS.length];
      const s = createRaid(seed * 31, SURVIVORS[0], { loot: loc.loot, zombies: loc.zombies, prize: loc.prize });
      const withKey = s.containers.find((c) => c.items.includes('vault_key'))!;
      // Distância a pé até o piso livre ao lado de cada móvel.
      const dist = bfsDistances(s, s.player, isWalkableForPath);
      const d = (c: { pos: { x: number; y: number } }) =>
        Math.min(...DIRS.map((v) => dist[idx(s, c.pos.x + v.x, c.pos.y + v.y)]).filter((n) => n >= 0));
      const closer = s.containers.filter((c) => !c.locked && d(c) < d(withKey)).length;
      expect(closer).toBeLessThan(5);
    }
  });
});

describe('raridade do saque', () => {
  it('segue a tabela do nível do móvel (10 mil sorteios)', async () => {
    const { rarityOdds, rollRarity } = await import('../src/sim/raid/loot');
    for (const [tier, danger] of [[1, 1], [2, 1], [3, 2], [3, 3]] as const) {
      const r = { rng: 12345 + tier * 7 + danger };
      const n = 10000;
      const count: Record<string, number> = { comum: 0, incomum: 0, raro: 0, lendario: 0 };
      for (let i = 0; i < n; i++) count[rollRarity(r, tier, danger)]++;
      const odds = rarityOdds(tier, danger);
      for (const k of Object.keys(count)) expect(Math.abs((count[k] / n) * 100 - odds[k as keyof typeof odds])).toBeLessThan(2);
    }
  });

  it('o perigo do local tira de comum e põe em raro', async () => {
    const { rarityOdds } = await import('../src/sim/raid/loot');
    expect(rarityOdds(1, 3).comum).toBe(70);
    expect(rarityOdds(1, 3).raro).toBe(12);
    expect(rarityOdds(3, 2).raro).toBe(35);
  });

  it('itens novos viram recursos no abrigo', async () => {
    const { ITEM_TO_RESOURCES } = await import('../src/data/shelter');
    const { ITEMS } = await import('../src/data/items');
    for (const id of Object.keys(ITEMS)) expect(ITEM_TO_RESOURCES[id as keyof typeof ITEM_TO_RESOURCES]).toBeDefined();
    expect(ITEM_TO_RESOURCES.first_aid).toEqual({ meds: 2, bandages: 2 });
  });
});

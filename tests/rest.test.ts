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

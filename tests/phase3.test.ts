import { describe, expect, it } from 'vitest';
import { LOCATIONS, locationById } from '../src/data/shelter';
import { SURVIVORS } from '../src/data/survivors';
import { createRaid } from '../src/sim/raid/raid';
import { delegateEmergency, pendingEmergencies, sendExpedition, takeOverEmergency } from '../src/sim/shelter/expeditions';
import { applyRaidResult, createShelter, markSeen, migrate, revealLocation, tickHour } from '../src/sim/shelter/shelter';
import type { ShelterState } from '../src/sim/shelter/types';

const lena = SURVIVORS[2];

/** Manda uma expedição e avança até ela partir e passar do ponto de emergência; força a emergência. */
function trappedExpedition(seed: number): ShelterState {
  const s = createShelter(seed, 0);
  expect(sendExpedition(s, 'garage', ['iuri'], 'greedy')).toBeNull();
  const exp = s.expeditions[0];
  while (s.hour < exp.departHour + 1) tickHour(s);
  exp.emergency = { survivorId: 'iuri', state: 'pending', deadline: exp.returnHour + 24 };
  return s;
}

describe('descoberta de locais', () => {
  it('começa só com os locais conhecidos e recusa expedição para o desconhecido', () => {
    const s = createShelter(1, 0);
    expect(s.discovered).toEqual(LOCATIONS.filter((l) => l.known).map((l) => l.id));
    expect(sendExpedition(s, 'hospital', ['iuri'], 'cautious')).toMatch(/caminho/);
  });

  it('um mapa rabiscado trazido de uma incursão revela o próximo local', () => {
    const s = createShelter(2, 0);
    const before = s.discovered.length;
    applyRaidResult(s, 'lena', { status: 'extracted', items: ['map_note', 'water'], hpLost: 0, kills: 0 }, 'garage');
    expect(s.discovered.length).toBe(before + 1);
    expect(s.resources.water).toBe(10);
    expect(sendExpedition(s, s.discovered[s.discovered.length - 1], ['iuri'], 'cautious')).toBeNull();
  });

  it('revelar todos os locais não quebra', () => {
    const s = createShelter(3, 0);
    for (let i = 0; i < 10; i++) revealLocation(s);
    expect(s.discovered.length).toBe(LOCATIONS.length);
    expect(revealLocation(s)).toBeNull();
  });

  it('saves antigos ganham os campos novos', () => {
    const s = createShelter(4, 0) as Partial<ShelterState>;
    delete s.discovered;
    delete s.seenResources;
    const m = migrate(s as ShelterState);
    expect(m.discovered.length).toBeGreaterThan(0);
    expect(m.seenResources).toBeNull();
  });

  it('markSeen guarda a foto dos recursos', () => {
    const s = createShelter(5, 0);
    markSeen(s);
    s.resources.food = 0;
    expect(s.seenResources!.food).toBe(8);
    expect(s.seenAlive).toHaveLength(3);
  });
});

describe('incursão por local', () => {
  it('cada local gera seu prédio; o mapa rabiscado aparece quando pedido', () => {
    for (const loc of LOCATIONS) {
      const r = createRaid(10, lena, { site: loc.name, loot: loc.loot, zombies: loc.zombies, mapNote: true });
      expect(r.site).toBe(loc.name);
      expect(r.zombies.length).toBeGreaterThanOrEqual(loc.zombies[0]);
      expect(r.containers.some((c) => c.items.includes('map_note'))).toBe(true);
    }
    const plain = createRaid(10, lena);
    expect(plain.containers.some((c) => c.items.includes('map_note'))).toBe(false);
  });

  it('modo emergência: horda acordada e telhado mais cedo', () => {
    const r = createRaid(11, lena, { emergency: true, zombies: locationById('police').zombies });
    expect(r.emergency).toBe(true);
    expect(r.nextSpawnTurn).toBe(3);
    expect(r.zombies.every((z) => z.state === 'investigating')).toBe(true);
    expect(r.exits.find((e) => e.id === 'roof')!.opensAt).toBe(6);
  });
});

describe('emergências de expedição', () => {
  it('assumir o controle tira o sobrevivente da expedição e o resultado vem da incursão', () => {
    const s = trappedExpedition(20);
    expect(pendingEmergencies(s)).toHaveLength(1);
    const taken = takeOverEmergency(s, s.expeditions[0].id);
    expect(taken?.survivor.id).toBe('iuri');
    expect(taken?.survivor.status).toBe('raid');
    expect(pendingEmergencies(s)).toHaveLength(0);

    taken!.survivor.status = 'home';
    applyRaidResult(s, 'iuri', { status: 'extracted', items: ['scrap'], hpLost: 1, kills: 2 }, 'garage');
    // A volta da expedição não resolve Iuri de novo.
    const diaryBefore = s.diary.length;
    while (s.expeditions.length) tickHour(s);
    expect(s.diary.slice(diaryBefore).some((e) => e.text.includes('Iuri trouxe'))).toBe(false);
  });

  it('ignorar ou delegar ainda resolve a expedição na volta', () => {
    for (const delegate of [false, true]) {
      const s = trappedExpedition(30);
      if (delegate) delegateEmergency(s, s.expeditions[0].id);
      expect(pendingEmergencies(s)).toHaveLength(delegate ? 0 : 1);
      while (s.expeditions.length) tickHour(s);
      const iuri = s.survivors.find((v) => v.id === 'iuri')!;
      expect(['home', 'dead']).toContain(iuri.status);
      expect(iuri.expeditionId).toBeNull();
    }
  });

  it('expedições perigosas às vezes se metem em apuros sozinhas', () => {
    let emergencies = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = createShelter(seed, 0);
      s.discovered.push('police');
      sendExpedition(s, 'police', ['iuri'], 'greedy');
      const exp = s.expeditions[0];
      while (s.hour < exp.departHour + 3) tickHour(s);
      if (exp.emergency) emergencies++;
    }
    expect(emergencies).toBeGreaterThan(5);
    expect(emergencies).toBeLessThan(55);
  });
});

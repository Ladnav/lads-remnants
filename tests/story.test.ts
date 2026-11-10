import { describe, expect, it } from 'vitest';
import { applyCommand, openShelter, startRaid } from '../src/server/game';
import { FRIEND, RIVAL, addBond, bondOf, die, friendsOf } from '../src/sim/shelter/core';
import { sendExpedition } from '../src/sim/shelter/expeditions';
import { EVAC, SIGNAL_HOURS, createShelter, evacuationNeeds, goalStage, isFinished, migrate, tickHour } from '../src/sim/shelter/shelter';
import type { ShelterState } from '../src/sim/shelter/types';

const NOW = 1_000_000;
const who = (s: ShelterState, id: string) => s.survivors.find((v) => v.id === id)!;

describe('laços entre sobreviventes', () => {
  it('trabalhar lado a lado aproxima; viram amigos e isso vai para o diário', () => {
    const s = createShelter(1, 0);
    s.resources.food = 99;
    s.resources.water = 99;
    who(s, 'marta').task = 'clean';
    who(s, 'lena').task = 'clean';
    const before = bondOf(s, 'marta', 'lena');
    for (let i = 0; i < 24 * 3; i++) tickHour(s);
    expect(bondOf(s, 'marta', 'lena')).toBeGreaterThan(before + 10);
    addBond(s, 'marta', 'lena', 100);
    expect(friendsOf(s, who(s, 'marta')).map((v) => v.id)).toContain('lena');
    expect(s.diary.some((e) => e.text.includes('viraram amigos'))).toBe(true);
  });

  it('a morte de um amigo pesa mais do que a de um conhecido', () => {
    const mourn = (bond: number) => {
      const s = createShelter(2, 0);
      addBond(s, 'lena', 'iuri', bond);
      const before = who(s, 'lena').mood;
      die(s, who(s, 'iuri'), 'Iuri morreu.');
      return before - who(s, 'lena').mood;
    };
    expect(mourn(FRIEND + 10)).toBeGreaterThan(mourn(0));
  });

  it('amigos na mesma tarefa rendem mais que desafetos', () => {
    const progress = (bond: number) => {
      const s = createShelter(3, 0);
      s.resources.food = 99;
      s.resources.water = 99;
      s.bonds = {};
      addBond(s, 'marta', 'lena', bond);
      who(s, 'lena').task = 'craft';
      who(s, 'iuri').task = 'rest';
      applyCommand(s, { type: 'build', recipe: 'workbench' }, 0);
      tickHour(s);
      return s.project?.progress ?? 99;
    };
    expect(progress(FRIEND)).toBeGreaterThan(progress(0));
    expect(progress(0)).toBeGreaterThan(progress(RIVAL));
  });

  it('voltar juntos de uma expedição aproxima', () => {
    let gained = 0;
    for (let seed = 1; seed <= 20 && !gained; seed++) {
      const s = createShelter(seed, 0);
      s.bonds = {};
      sendExpedition(s, 'market', ['iuri', 'lena'], 'cautious');
      while (s.expeditions.length && s.hour < 60) tickHour(s);
      if (who(s, 'iuri').status === 'home' && who(s, 'lena').status === 'home') gained = bondOf(s, 'iuri', 'lena');
    }
    expect(gained).toBeGreaterThanOrEqual(6);
  });
});

describe('objetivo: sair da cidade', () => {
  it('rádio → transmissão → suprimentos → partida', () => {
    const s = openShelter(null, NOW, 5);
    expect(goalStage(s)).toBe('radio');
    expect(applyCommand(s, { type: 'evacuate' }, NOW).ok).toBe(false);

    s.buildings.radio = 1;
    s.resources.food = 99;
    s.resources.water = 99;
    expect(goalStage(s)).toBe('signal');
    for (let i = 0; i < 24 * 5 && goalStage(s) === 'signal'; i++) tickHour(s);
    expect(s.signal).toBe(SIGNAL_HOURS);
    expect(goalStage(s)).toBe('supplies');
    s.lastRealMs = NOW;

    // Sem combustível não sai; com alguém fora também não.
    expect(applyCommand(s, { type: 'evacuate' }, NOW).ok).toBe(false);
    s.resources.fuel = EVAC.fuel;
    who(s, 'lena').status = 'away';
    expect(applyCommand(s, { type: 'evacuate' }, NOW).ok).toBe(false);
    who(s, 'lena').status = 'home';

    const need = evacuationNeeds(s);
    const food = s.resources.food;
    expect(applyCommand(s, { type: 'evacuate' }, NOW).ok).toBe(true);
    expect(s.ended?.saved).toHaveLength(3);
    expect(s.resources.fuel).toBe(0);
    expect(s.resources.food).toBe(food - need.food);
    expect(isFinished(s)).toBe(true);

    // Depois do fim, nada mais acontece.
    const hour = s.hour;
    expect(applyCommand(s, { type: 'ration', on: true }, NOW + 1e9).ok).toBe(false);
    expect(startRaid(s, { survivorId: 'lena', locationId: 'market' }, 1, NOW + 1e9).ok).toBe(false);
    expect(s.hour).toBe(hour);
  });

  it('saves antigos ganham os campos novos', () => {
    const s = createShelter(6, 0) as Partial<ShelterState> & ShelterState;
    delete (s as Partial<ShelterState>).bonds;
    delete (s as Partial<ShelterState>).signal;
    delete (s as Partial<ShelterState>).ended;
    delete (s.buildings as Partial<ShelterState['buildings']>).radio;
    migrate(s);
    expect(s.bonds).toEqual({});
    expect(s.signal).toBe(0);
    expect(s.ended).toBeNull();
    expect(s.buildings.radio).toBe(0);
  });
});

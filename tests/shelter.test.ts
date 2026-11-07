import { describe, expect, it } from 'vitest';
import { REAL_MS_PER_GAME_HOUR, emotionOf, hourOfDay } from '../src/sim/shelter/core';
import { scheduleWindow, sendExpedition } from '../src/sim/shelter/expeditions';
import {
  MAX_CATCHUP_HOURS,
  START_HOUR,
  advanceTo,
  applyRaidResult,
  createShelter,
  startProject,
  tickHour,
} from '../src/sim/shelter/shelter';
import { resolveDilemma } from '../src/sim/shelter/visitors';

describe('abrigo', () => {
  it('é determinístico: mesma semente, mesma história', () => {
    const a = createShelter(77, 0);
    const b = createShelter(77, 0);
    for (let i = 0; i < 24 * 6; i++) {
      tickHour(a);
      tickHour(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('recupera o tempo offline em horas de jogo, com limite', () => {
    const s = createShelter(1, 0);
    expect(advanceTo(s, REAL_MS_PER_GAME_HOUR * 3.5)).toBe(3);
    expect(s.hour).toBe(START_HOUR + 3);
    expect(s.lastRealMs).toBe(REAL_MS_PER_GAME_HOUR * 3);

    const far = createShelter(1, 0);
    expect(advanceTo(far, REAL_MS_PER_GAME_HOUR * 10_000)).toBe(MAX_CATCHUP_HOURS);
  });

  it('sem comida nem água, as pessoas enfraquecem e morrem', () => {
    const s = createShelter(2, 0);
    s.resources.food = 0;
    s.resources.water = 0;
    for (let i = 0; i < 24 * 10; i++) tickHour(s);
    expect(s.survivors.every((v) => v.status !== 'home' || v.health < 50)).toBe(true);
    expect(s.survivors.some((v) => v.status === 'dead' || v.status === 'gone')).toBe(true);
  });

  it('construção consome materiais e termina com trabalho', () => {
    const s = createShelter(3, 0);
    expect(startProject(s, 'filter')).toBe('Precisa de uma bancada.');
    expect(startProject(s, 'workbench')).toBeNull();
    expect(s.resources.wood).toBe(3);
    expect(startProject(s, 'bed')).toBe('Já existe um projeto em andamento.');
    for (let i = 0; i < 10; i++) tickHour(s);
    expect(s.buildings.workbench).toBe(1);
    expect(s.project).toBeNull();
  });

  it('expedições saem às 21h e voltam às 6h', () => {
    const w = scheduleWindow(8);
    expect(hourOfDay(w.depart)).toBe(21);
    expect(hourOfDay(w.ret)).toBe(6);
    expect(w.ret).toBeGreaterThan(w.depart);
    expect(hourOfDay(scheduleWindow(22).depart)).toBe(23);

    const s = createShelter(4, 0);
    expect(sendExpedition(s, 'garage', ['iuri'], 'cautious')).toBeNull();
    expect(sendExpedition(s, 'market', ['iuri'], 'cautious')).not.toBeNull();
    while (s.hour < w.depart) tickHour(s);
    expect(s.survivors.find((v) => v.id === 'iuri')!.status).toBe('away');
    while (s.expeditions.length) tickHour(s);
    const iuri = s.survivors.find((v) => v.id === 'iuri')!;
    expect(['home', 'dead']).toContain(iuri.status);
    expect(iuri.expeditionId).toBeNull();
  });

  it('o loot da incursão ativa entra no abrigo; a morte é permanente', () => {
    const s = createShelter(5, 0);
    const food = s.resources.food;
    applyRaidResult(s, 'lena', { status: 'extracted', items: ['canned_food', 'water'], hpLost: 1, kills: 0 });
    expect(s.resources.food).toBe(food + 2);
    expect(s.survivors.find((v) => v.id === 'lena')!.health).toBe(75);

    const moodBefore = s.survivors.find((v) => v.id === 'iuri')!.mood;
    applyRaidResult(s, 'marta', { status: 'dead', items: ['medicine'], hpLost: 3, kills: 0 });
    expect(s.survivors.find((v) => v.id === 'marta')!.status).toBe('dead');
    expect(s.survivors.find((v) => v.id === 'iuri')!.mood).toBeLessThan(moodBefore);
  });

  it('recusar saqueadores traz um ataque garantido de madrugada', () => {
    const s = createShelter(6, 0);
    s.dilemmas.push({ id: 99, kind: 'bandits', title: 't', text: 't', options: [], expiresHour: s.hour + 6 });
    resolveDilemma(s, 99, 'refuse');
    expect(s.banditThreat).toBe(3);
    while (hourOfDay(s.hour) !== 2) tickHour(s);
    expect(s.banditThreat).toBe(0);
    expect(s.diary.some((e) => /Saqueadores tentaram|Invadiram/.test(e.text))).toBe(true);
  });

  it('emoções seguem o humor', () => {
    expect(emotionOf(80)).toBe('ok');
    expect(emotionOf(40)).toBe('triste');
    expect(emotionOf(20)).toBe('deprimido');
    expect(emotionOf(5)).toBe('quebrado');
  });
});

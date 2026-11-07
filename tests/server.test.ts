import { describe, expect, it } from 'vitest';
import { abandonRaid, applyCommand, finishRaid, openShelter, startRaid } from '../src/server/game';
import { applyAction, createRaid } from '../src/sim/raid/raid';
import { REAL_MS_PER_GAME_HOUR } from '../src/sim/shelter/core';

const NOW = 1_000_000;

/** Joga uma incursão "de verdade" no cliente: entra e sai pela entrada. */
function playEnterAndLeave(seed: number, ticket: Parameters<typeof createRaid>[1], opts: Parameters<typeof createRaid>[2]) {
  const r = createRaid(seed, ticket, opts);
  applyAction(r, { type: 'move', dx: 0, dy: 1 });
  applyAction(r, { type: 'extract' });
  return r;
}

describe('servidor: comandos', () => {
  it('abre um abrigo novo e aplica comandos válidos', () => {
    const s = openShelter(null, NOW, 42);
    expect(applyCommand(s, { type: 'build', recipe: 'workbench' }, NOW).ok).toBe(true);
    const again = applyCommand(s, { type: 'build', recipe: 'bed' }, NOW);
    expect(again.ok).toBe(false);
  });

  it('cada comando avança o relógio até agora', () => {
    const s = openShelter(null, NOW, 1);
    const h = s.hour;
    applyCommand(s, { type: 'ration', on: true }, NOW + REAL_MS_PER_GAME_HOUR * 5);
    expect(s.hour).toBe(h + 5);
  });

  it('rejeita comando desconhecido', () => {
    const s = openShelter(null, NOW, 2);
    expect(applyCommand(s, { type: 'hack' } as never, NOW).ok).toBe(false);
  });
});

describe('servidor: incursões', () => {
  it('ingresso → log de ações → resultado conferido pelo servidor', () => {
    const s = openShelter(null, NOW, 3);
    const t = startRaid(s, { survivorId: 'lena', locationId: 'market' }, 777, NOW);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(s.survivors.find((v) => v.id === 'lena')!.status).toBe('raid');
    expect(startRaid(s, { survivorId: 'iuri', locationId: 'market' }, 1, NOW).ok).toBe(false);

    const played = playEnterAndLeave(t.value.seed, t.value.def, t.value.opts);
    expect(played.status).toBe('extracted');
    const done = finishRaid(s, t.value.id, played.log, NOW);
    expect(done.ok).toBe(true);
    expect(s.activeRaid).toBeNull();
    expect(s.survivors.find((v) => v.id === 'lena')!.status).toBe('home');
  });

  it('um log que não termina a incursão conta como fuga ferida', () => {
    const s = openShelter(null, NOW, 4);
    const t = startRaid(s, { survivorId: 'iuri', locationId: 'market' }, 99, NOW);
    if (!t.ok) throw new Error(t.error);
    const health = s.survivors.find((v) => v.id === 'iuri')!.health;
    const r = finishRaid(s, t.value.id, [{ type: 'wait' }], NOW);
    expect(r.ok).toBe(false);
    const iuri = s.survivors.find((v) => v.id === 'iuri')!;
    expect(iuri.status).toBe('home');
    expect(iuri.health).toBe(health - 25);
  });

  it('o loot vem da reprodução no servidor, não do que o cliente diz', () => {
    const s = openShelter(null, NOW, 5);
    const t = startRaid(s, { survivorId: 'lena', locationId: 'market' }, 1234, NOW);
    if (!t.ok) throw new Error(t.error);
    const food = s.resources.food;
    // O cliente "inventa" uma mochila, mas só manda ações: sair sem pegar nada.
    const played = playEnterAndLeave(t.value.seed, t.value.def, t.value.opts);
    finishRaid(s, t.value.id, played.log, NOW);
    expect(s.resources.food).toBe(food);
  });

  it('reabrir o jogo com incursão aberta encerra como fuga', () => {
    const s = openShelter(null, NOW, 6);
    startRaid(s, { survivorId: 'marta', locationId: 'garage' }, 5, NOW);
    const reopened = openShelter(JSON.parse(JSON.stringify(s)), NOW, 0);
    expect(reopened.activeRaid).toBeNull();
    expect(reopened.survivors.find((v) => v.id === 'marta')!.status).toBe('home');
  });

  it('local desconhecido e ingresso trocado são recusados', () => {
    const s = openShelter(null, NOW, 7);
    expect(startRaid(s, { survivorId: 'lena', locationId: 'hospital' }, 1, NOW).ok).toBe(false);
    const t = startRaid(s, { survivorId: 'lena', locationId: 'market' }, 1, NOW);
    if (!t.ok) throw new Error(t.error);
    expect(finishRaid(s, t.value.id + 1, [], NOW).ok).toBe(false);
    abandonRaid(s);
    expect(s.activeRaid).toBeNull();
  });
});

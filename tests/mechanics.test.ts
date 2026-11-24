import { describe, expect, it } from 'vitest';
import { SURVIVORS } from '../src/data/survivors';
import { ZOMBIES } from '../src/data/zombies';
import { applyCommand, finishRaid, openShelter, startRaid } from '../src/server/game';
import { applyAction, canShootAt, canThrowAt, capacity, createRaid, START_ROCKS } from '../src/sim/raid/raid';
import type { RaidState } from '../src/sim/raid/types';
import { REAL_MS_PER_GAME_HOUR } from '../src/sim/shelter/core';
import { sendExpedition } from '../src/sim/shelter/expeditions';
import { DORMANT_AFTER, createShelter, isDormant, isGameOver, migrate, tickHour } from '../src/sim/shelter/shelter';
import type { RaidTicket, ShelterState } from '../src/sim/shelter/types';

const NOW = 1_000_000;
const HOUR = REAL_MS_PER_GAME_HOUR;
const lena = SURVIVORS[2];

function enterAndLeave(t: RaidTicket): RaidState {
  const r = createRaid(t.seed, t.def, t.opts);
  applyAction(r, { type: 'move', dx: 0, dy: 1 });
  applyAction(r, { type: 'extract' });
  return r;
}

function ticket(s: ShelterState, req: Parameters<typeof startRaid>[1], now = NOW): RaidTicket {
  const r = startRaid(s, req, 4321, now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('incursão ativa: limites', () => {
  it('uma incursão por dia por sobrevivente', () => {
    const s = openShelter(null, NOW, 1);
    const t = ticket(s, { survivorId: 'lena', locationId: 'market' });
    finishRaid(s, t.id, enterAndLeave(t).log, NOW);
    const again = startRaid(s, { survivorId: 'lena', locationId: 'market' }, 1, NOW);
    expect(again.ok).toBe(false);
    // Outra pessoa pode ir no mesmo dia; a mesma só no dia seguinte.
    expect(startRaid(s, { survivorId: 'iuri', locationId: 'market' }, 1, NOW).ok).toBe(true);
    const s2 = openShelter(null, NOW, 1);
    const t2 = ticket(s2, { survivorId: 'lena', locationId: 'market' });
    finishRaid(s2, t2.id, enterAndLeave(t2).log, NOW);
    expect(startRaid(s2, { survivorId: 'lena', locationId: 'market' }, 1, NOW + HOUR * 24).ok).toBe(true);
  });

  it('quem está exausto não sai', () => {
    const s = openShelter(null, NOW, 2);
    s.survivors.find((v) => v.id === 'lena')!.fatigue = 90;
    expect(startRaid(s, { survivorId: 'lena', locationId: 'market' }, 1, NOW).ok).toBe(false);
  });

  it('local saqueado tem bem menos loot', () => {
    const count = (scale: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (const c of createRaid(seed, lena, { lootScale: scale }).containers) n += c.items.length;
      }
      return n;
    };
    expect(count(0.1)).toBeLessThan(count(1) * 0.25);
  });

  it('só um mapa rabiscado por local', () => {
    const s = openShelter(null, NOW, 3);
    const t = ticket(s, { survivorId: 'lena', locationId: 'market' });
    expect(t.opts.mapNote).toBe(true);
    s.mapsFound.push('market');
    s.activeRaid = null;
    s.survivors.find((v) => v.id === 'lena')!.status = 'home';
    expect(ticket(s, { survivorId: 'iuri', locationId: 'market' }).opts.mapNote).toBe(false);
    s.activeRaid = null;
    expect(ticket(s, { survivorId: 'marta', locationId: 'garage' }).opts.mapNote).toBe(true);
  });
});

describe('equipamento', () => {
  it('sai do arsenal, vai no corpo e volta com o desgaste, sem contar como achado', () => {
    const s = openShelter(null, NOW, 4);
    const stock = s.locationStock.market;
    expect(s.arsenal.map((w) => w.id)).toEqual(['knife']);
    const t = ticket(s, { survivorId: 'lena', locationId: 'market', loadout: { weapon: 0, bandages: 2 } });
    expect(s.arsenal).toHaveLength(0);
    expect(s.resources.weapons).toBe(0);
    expect(s.resources.bandages).toBe(0);
    expect(t.opts.startItems).toEqual(['bandage', 'bandage']);
    expect(t.opts.gear?.weapon?.id).toBe('knife');
    const played = enterAndLeave(t);
    finishRaid(s, t.id, played.log, NOW);
    expect(s.arsenal.map((w) => w.id)).toEqual(['knife']);
    expect(s.resources.weapons).toBe(1);
    expect(s.resources.bandages).toBe(2);
    expect(s.locationStock.market).toBe(stock);
  });

  it('aceita o pedido antigo (weapon: true) e recusa o que o arsenal não tem', () => {
    const s = openShelter(null, NOW, 5);
    expect(startRaid(s, { survivorId: 'lena', locationId: 'market', loadout: { weapon: 3 } }, 1, NOW).ok).toBe(false);
    expect(startRaid(s, { survivorId: 'lena', locationId: 'market', loadout: { pack: 0 } }, 1, NOW).ok).toBe(false);
    const r = startRaid(s, { survivorId: 'lena', locationId: 'market', loadout: { weapon: true, bandages: 2 } }, 1, NOW);
    expect(r.ok).toBe(true);
    expect(s.arsenal).toHaveLength(0);
    expect(s.resources.bandages).toBe(0);
  });

  it('balas só saem do estoque com arma de fogo, e as que sobram voltam', () => {
    const s = openShelter(null, NOW, 6);
    s.arsenal.push({ id: 'revolver', wear: 30 });
    s.resources.ammo = 10;
    const t = ticket(s, { survivorId: 'lena', locationId: 'market', loadout: { weapon: 1, rounds: 6 } });
    expect(t.opts.rounds).toBe(6);
    expect(s.resources.ammo).toBe(4);
    const played = enterAndLeave(t);
    finishRaid(s, t.id, played.log, NOW);
    expect(s.resources.ammo).toBe(10);
    expect(s.arsenal.some((w) => w.id === 'revolver')).toBe(true);
  });

  it('saves antigos: as armas viram facas no arsenal', () => {
    const s = openShelter(null, NOW, 7) as unknown as Record<string, unknown> & { resources: { weapons: number } };
    delete s.arsenal;
    s.resources.weapons = 3;
    const m = migrate(s as never);
    expect(m.arsenal.map((w) => w.id)).toEqual(['knife', 'knife', 'knife']);
    expect(m.resources.weapons).toBe(3);
  });
});

describe('armas e proteção na incursão', () => {
  const clearLine = (r: ReturnType<typeof createRaid>, to: { x: number; y: number }) => {
    for (let y = to.y; y < r.player.y; y++) r.tiles[y * r.width + r.player.x] = { kind: 'floor' };
  };

  it('revólver atira de longe, gasta bala e chama a horda', () => {
    const r = createRaid(11, lena, { gear: { weapon: { id: 'revolver', wear: 30 } }, rounds: 3 });
    const target = { x: r.player.x, y: r.player.y - 3 };
    clearLine(r, target);
    r.zombies = [{ id: 0, kind: 'walker', pos: target, hp: 2, state: 'idle', target: null, moveAcc: 0 }];
    const spawnBefore = r.nextSpawnTurn;
    expect(canShootAt(r, target)).toBe(true);
    applyAction(r, { type: 'shoot', x: target.x, y: target.y });
    expect(r.rounds).toBe(2);
    expect(r.gear.weapon?.wear).toBe(29);
    expect(r.nextSpawnTurn).toBeLessThanOrEqual(Math.max(r.turn + 1, spawnBefore - 2) + 8);
    r.rounds = 0;
    r.zombies = [{ id: 1, kind: 'walker', pos: target, hp: 2, state: 'idle', target: null, moveAcc: 0 }];
    expect(canShootAt(r, target)).toBe(false);
  });

  it('a arma quebra no fim do desgaste e a luta volta para as mãos', () => {
    const r = createRaid(12, lena, { gear: { weapon: { id: 'knife', wear: 1 } } });
    const z = { x: r.player.x + 1, y: r.player.y };
    r.tiles[z.y * r.width + z.x] = { kind: 'floor' };
    r.zombies = [{ id: 0, kind: 'brute', pos: z, hp: 9, state: 'idle', target: null, moveAcc: 0 }];
    applyAction(r, { type: 'move', dx: 1, dy: 0 });
    expect(r.gear.weapon).toBeUndefined();
  });

  it('mochila maior carrega mais e o colete pesa', () => {
    expect(capacity(createRaid(1, lena, { gear: { pack: { id: 'pack_military', wear: 0 } } }))).toBe(18);
    expect(capacity(createRaid(1, lena, { gear: { armor: { id: 'vest', wear: 0 } } }))).toBe(9);
  });
});

describe('combate', () => {
  it('pedra distrai zumbis no raio e gasta munição de pedras', () => {
    const r = createRaid(7, lena);
    const target = { x: r.player.x, y: r.player.y - 3 };
    r.zombies = [{ id: 0, kind: 'walker', pos: { x: target.x + 4, y: target.y }, hp: 2, state: 'idle', target: null, moveAcc: 0 }];
    // Garante linha de visão no teste.
    for (let y = target.y; y < r.player.y; y++) r.tiles[y * r.width + r.player.x] = { kind: 'floor' };
    expect(canThrowAt(r, target)).toBe(true);
    expect(canThrowAt(r, { x: r.player.x, y: r.player.y - 1 })).toBe(false);
    applyAction(r, { type: 'throw', x: target.x, y: target.y });
    expect(r.rocks).toBe(START_ROCKS - 1);
    expect(r.zombies[0].target).toEqual(target);
    r.rocks = 0;
    expect(canThrowAt(r, target)).toBe(false);
  });

  it('locais perigosos têm corredores e brutamontes', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      for (const z of createRaid(seed, lena, { specials: 0.4, zombies: [6, 8] }).zombies) {
        kinds.add(z.kind);
        expect(z.hp).toBe(ZOMBIES[z.kind].hp);
      }
    }
    expect([...kinds].sort()).toEqual(['brute', 'runner', 'walker']);
    expect(createRaid(1, lena).zombies.every((z) => z.kind === 'walker')).toBe(true);
  });
});

describe('ritmo idle', () => {
  it('ordem permanente manda a expedição toda noite', () => {
    const s = openShelter(null, NOW, 8);
    expect(applyCommand(s, { type: 'standing', order: { locationId: 'market', ids: ['iuri'], risk: 'cautious' } }, NOW).ok).toBe(true);
    expect(applyCommand(s, { type: 'standing', order: { locationId: 'hospital', ids: ['iuri'], risk: 'cautious' } }, NOW).ok).toBe(false);
    let departures = 0;
    for (let i = 0; i < 24 * 4 && !isGameOver(s); i++) {
      tickHour(s);
      if (s.diary[s.diary.length - 1]?.text.includes('sai pela porta')) departures++;
    }
    expect(departures).toBeGreaterThanOrEqual(3);
  });

  it('fila de construção começa sozinha quando há material', () => {
    const s = openShelter(null, NOW, 9);
    applyCommand(s, { type: 'build', recipe: 'workbench' }, NOW);
    applyCommand(s, { type: 'queue', recipe: 'bed' }, NOW);
    applyCommand(s, { type: 'queue', recipe: 'filter' }, NOW);
    expect(s.buildQueue).toEqual(['bed', 'filter']);
    for (let i = 0; i < 12; i++) tickHour(s);
    expect(s.buildings.workbench).toBe(1);
    expect(s.buildings.bed + (s.project?.recipe === 'bed' ? 1 : 0)).toBe(2);
    // O filtro espera na fila: faltam peças.
    expect(s.buildQueue).toEqual(['filter']);
    applyCommand(s, { type: 'unqueue', index: 0 }, NOW);
    expect(s.buildQueue).toEqual([]);
  });

  it('modo de espera: depois de um dia real sem visita, meia porção; um comando acorda', () => {
    const s = createShelter(10, 0);
    for (let i = 0; i < DORMANT_AFTER - 1; i++) tickHour(s);
    expect(isDormant(s)).toBe(false);
    tickHour(s);
    expect(isDormant(s)).toBe(true);
    applyCommand(s, { type: 'ration', on: false }, 0);
    expect(isDormant(s)).toBe(false);
  });

  it('sem visita, com ordem permanente o abrigo dura bem mais', () => {
    const lasts = (withOrder: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 15; seed++) {
        const s = createShelter(seed, 0);
        if (withOrder) applyCommand(s, { type: 'standing', order: { locationId: 'market', ids: ['iuri'], risk: 'balanced' } }, 0);
        while (!isGameOver(s) && s.hour < 24 * 40) tickHour(s);
        total += s.hour;
      }
      return total / 15;
    };
    expect(lasts(true)).toBeGreaterThan(lasts(false) * 1.5);
  });
});

describe('emergência com prazo', () => {
  it('o grupo volta, o encurralado espera até o prazo e só então se resolve', () => {
    const s = createShelter(11, 0);
    sendExpedition(s, 'garage', ['iuri', 'lena'], 'balanced');
    const exp = s.expeditions[0];
    while (s.hour < exp.departHour + 1) tickHour(s);
    exp.emergency = { survivorId: 'iuri', state: 'pending', deadline: exp.returnHour + 24 };
    while (s.hour < exp.returnHour + 2) tickHour(s);
    const iuri = s.survivors.find((v) => v.id === 'iuri')!;
    const lenaS = s.survivors.find((v) => v.id === 'lena')!;
    expect(lenaS.expeditionId).toBeNull();
    expect(iuri.status).toBe('away');
    expect(s.expeditions).toHaveLength(1);
    while (s.hour < exp.emergency.deadline + 1) tickHour(s);
    expect(['home', 'dead']).toContain(iuri.status);
    expect(s.expeditions.filter((e) => e.id === exp.id)).toHaveLength(0);
  });
});

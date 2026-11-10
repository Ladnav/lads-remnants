import { describe, expect, it } from 'vitest';
import { SURVIVORS } from '../src/data/survivors';
import { bfsDistances, idx, isWalkableForPath } from '../src/sim/raid/grid';
import {
  applyAction,
  capacity,
  carriedWeight,
  createRaid,
  propagateNoise,
  replay,
} from '../src/sim/raid/raid';
import type { Action, RaidState } from '../src/sim/raid/types';
import { DIRS } from '../src/sim/raid/grid';

const [marta, iuri, lena] = SURVIVORS;

function randomActions(n: number, seed: number): Action[] {
  let s = seed;
  const out: Action[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const d = DIRS[s % 4];
    out.push(s % 7 === 0 ? { type: 'wait' } : { type: 'move', dx: d.x, dy: d.y });
  }
  return out;
}

function snapshot(s: RaidState) {
  return JSON.stringify({ ...s, log: undefined, lastNoises: undefined });
}

describe('geração do mapa', () => {
  it('todo piso e todo container são alcançáveis a partir da entrada', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = createRaid(seed, lena);
      const dist = bfsDistances(s, s.player, isWalkableForPath);
      s.tiles.forEach((t, i) => {
        if ((t.kind === 'floor' || t.kind === 'door') && t.containerId === undefined) {
          expect(dist[i], `seed ${seed} tile ${i}`).toBeGreaterThanOrEqual(0);
        }
      });
      expect(s.exits).toHaveLength(2);
      expect(s.containers.length).toBeGreaterThan(0);
    }
  });

  it('mesma semente gera o mesmo mapa', () => {
    expect(snapshot(createRaid(42, marta))).toBe(snapshot(createRaid(42, marta)));
    expect(snapshot(createRaid(42, marta))).not.toBe(snapshot(createRaid(43, marta)));
  });
});

describe('determinismo', () => {
  it('semente + log de ações reproduz o mesmo resultado', () => {
    for (const seed of [7, 99, 1234]) {
      const live = createRaid(seed, marta);
      for (const a of randomActions(80, seed)) applyAction(live, a);
      const replayed = replay(seed, marta, live.log);
      expect(snapshot(replayed)).toBe(snapshot(live));
    }
  });
});

describe('ruído', () => {
  it('zumbis dentro do raio vão investigar a origem; fora do raio, não', () => {
    const s = createRaid(5, lena);
    s.zombies = [
      { id: 0, kind: 'walker', pos: { x: 5, y: 5 }, hp: 2, state: 'idle', target: null, moveAcc: 0 },
      { id: 1, kind: 'walker', pos: { x: 15, y: 5 }, hp: 2, state: 'idle', target: null, moveAcc: 0 },
    ];
    propagateNoise(s, [{ pos: { x: 7, y: 5 }, radius: 3 }]);
    expect(s.zombies[0].state).toBe('investigating');
    expect(s.zombies[0].target).toEqual({ x: 7, y: 5 });
    expect(s.zombies[1].state).toBe('idle');
  });
});

describe('mochila', () => {
  it('respeita o limite de peso e o traço Forte aumenta a capacidade', () => {
    const s = createRaid(3, lena);
    expect(capacity(s)).toBe(10);
    expect(capacity(createRaid(3, iuri))).toBe(14);

    const c = s.containers[0];
    s.player = findFreeNeighbour(s, c.pos);
    c.searched = true;
    c.items = ['fuel', 'fuel', 'fuel', 'fuel'];
    for (let i = 0; i < 4; i++) applyAction(s, { type: 'take', containerId: c.id, index: 0 });
    expect(carriedWeight(s)).toBe(9);
    expect(c.items).toEqual(['fuel']);
  });
});

describe('extração', () => {
  it('extrair na entrada encerra a incursão', () => {
    const s = createRaid(11, lena);
    applyAction(s, { type: 'move', dx: 0, dy: 1 });
    applyAction(s, { type: 'extract' });
    expect(s.status).toBe('extracted');
  });
});

describe('estresse', () => {
  it('300 incursões com ações aleatórias de todos os tipos não quebram', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = createRaid(seed, SURVIVORS[seed % 3]);
      let r = seed;
      for (let i = 0; i < 150 && s.status === 'active'; i++) {
        r = (r * 1103515245 + 12345) & 0x7fffffff;
        const near = s.containers.find((c) => Math.max(Math.abs(c.pos.x - s.player.x), Math.abs(c.pos.y - s.player.y)) === 1);
        const d = DIRS[r % 4];
        const roll = r % 20;
        const a: Action =
          roll === 0 && near ? { type: near.searched ? 'take' : 'search', containerId: near.id, index: 0, } as Action
          : roll === 1 ? { type: 'pick', x: s.player.x + d.x, y: s.player.y + d.y }
          : roll === 2 ? { type: 'force', x: s.player.x + d.x, y: s.player.y + d.y }
          : roll === 3 ? { type: 'extract' }
          : roll === 4 ? { type: 'drop', index: 0 }
          : roll === 5 ? { type: 'use', index: 0 }
          : { type: 'move', dx: d.x, dy: d.y };
        applyAction(s, a);
        expect(s.survivor.hp).toBeLessThanOrEqual(s.survivor.maxHp);
        for (const z of s.zombies) expect(s.tiles[idx(s, z.pos.x, z.pos.y)].kind).not.toBe('wall');
      }
    }
  });
});

function findFreeNeighbour(s: RaidState, p: { x: number; y: number }) {
  for (const d of DIRS) {
    const t = s.tiles[idx(s, p.x + d.x, p.y + d.y)];
    if (t && t.kind === 'floor' && t.containerId === undefined) return { x: p.x + d.x, y: p.y + d.y };
  }
  throw new Error('sem vizinho livre');
}

// Balanceamento da incursão: um robô joga centenas de incursões e mede sucesso, saque e mortes.
// Joga como um jogador razoável: vai ao móvel mais perto ainda não vasculhado, leva o que cabe,
// pega a chave e abre o cofre, bate em zumbi que encosta e sai quando a mochila enche, a vida
// cai ou o tempo aperta.
//   npx vite-node scripts/raid-bot.ts
import { LOCATIONS } from '../src/data/shelter';
import { SURVIVORS } from '../src/data/survivors';
import { ITEMS } from '../src/data/items';
import { applyAction, canShootAt, capacity, carriedWeight, createRaid, exitBlocked, exitStatus, lootValue } from '../src/sim/raid/raid';
import { fresh } from '../src/data/gear';
import type { ItemId } from '../src/data/items';

/** EQUIP=revolver|knife|machete|nada (padrão: nada) e ROUNDS=n. */
const EQUIP = (process.env.EQUIP ?? 'nada') as ItemId | 'nada';
const ROUNDS = Number(process.env.ROUNDS ?? 6);
import type { RaidState, Vec } from '../src/sim/raid/types';

const DIRS: Vec[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** Primeiro passo do menor caminho até um tile vizinho de `goal` (ou até o próprio goal). */
function stepToward(s: RaidState, goal: Vec, adjacent: boolean): Vec | null {
  const W = s.width;
  const start = s.player.y * W + s.player.x;
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  const done = (i: number) => {
    const x = i % W;
    const y = Math.floor(i / W);
    return adjacent ? Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y)) === 1 && (x === goal.x || y === goal.y || true) : x === goal.x && y === goal.y;
  };
  let hit = -1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    if (c !== start && done(c)) {
      hit = c;
      break;
    }
    if (c === start && done(c)) return { x: 0, y: 0 };
    for (const d of DIRS) {
      const nx = (c % W) + d.x;
      const ny = Math.floor(c / W) + d.y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= s.height) continue;
      const n = ny * W + nx;
      const t = s.tiles[n];
      if (prev.has(n) || t.kind === 'wall' || t.containerId !== undefined) continue;
      prev.set(n, c);
      q.push(n);
    }
  }
  if (hit < 0) return null;
  let c = hit;
  while (prev.get(c) !== start) c = prev.get(c)!;
  return { x: (c % W) - s.player.x, y: Math.floor(c / W) - s.player.y };
}

/** Anda um passo; porta trancada no caminho é arrombada (fechadura, ou no ombro). */
function walk(s: RaidState, st: Vec): void {
  const x = s.player.x + st.x;
  const y = s.player.y + st.y;
  const t = s.tiles[y * s.width + x];
  if (t.kind === 'door' && t.door === 'locked') applyAction(s, { type: 'pick', x, y });
  else applyAction(s, { type: 'move', dx: st.x, dy: st.y });
}

function play(seed: number, locIdx: number, survivorIdx: number) {
  const loc = LOCATIONS[locIdx];
  const def = SURVIVORS[survivorIdx];
  const s = createRaid(seed, def, { site: loc.name, loot: loc.loot, zombies: loc.zombies, prize: loc.prize, specials: { 1: 0.1, 2: 0.25, 3: 0.4 }[loc.danger], calm: { 1: 4, 2: 1, 3: 0 }[loc.danger], danger: loc.danger, gear: EQUIP === 'nada' ? {} : { weapon: fresh(EQUIP) }, rounds: EQUIP === 'revolver' || EQUIP === 'shotgun' ? ROUNDS : 0 });
  let vault = false;
  for (let guard = 0; guard < 400 && s.status === 'active'; guard++) {
    // Arma de fogo: atira no zumbi que vem chegando antes de ele encostar.
    const target = s.zombies.find((z) => z.state === 'chasing' && canShootAt(s, z.pos) && Math.abs(z.pos.x - s.player.x) + Math.abs(z.pos.y - s.player.y) > 1);
    if (target) {
      applyAction(s, { type: 'shoot', x: target.pos.x, y: target.pos.y });
      continue;
    }
    // Zumbi encostado: bate.
    const z = s.zombies.find((z) => Math.abs(z.pos.x - s.player.x) + Math.abs(z.pos.y - s.player.y) === 1);
    if (z) {
      applyAction(s, { type: 'move', dx: z.pos.x - s.player.x, dy: z.pos.y - s.player.y });
      continue;
    }
    const full = carriedWeight(s) >= capacity(s) - 1;
    const hurt = s.survivor.hp <= 1;
    const late = s.turn > 45;
    const todo = s.containers
      .filter((c) => !c.searched || c.items.length)
      .filter((c) => !(c.locked && !s.backpack.includes('vault_key')))
      .sort((a, b) => Math.abs(a.pos.x - s.player.x) + Math.abs(a.pos.y - s.player.y) - (Math.abs(b.pos.x - s.player.x) + Math.abs(b.pos.y - s.player.y)));
    // Com a chave na mão, o cofre vem primeiro (mesmo de mochila cheia: larga o que vale menos lá).
    const vaultC = s.containers.find((c) => c.locked);
    if (vaultC && s.backpack.includes('vault_key') && !hurt && s.turn < 50) todo.unshift(vaultC);
    else if (full || hurt || late || !todo.length) {
      const exits = s.exits.filter((e) => !exitBlocked(s, e.id) || exitStatus(s, e.id) === 'soon');
      const exit = exits.find((e) => !exitBlocked(s, e.id)) ?? exits[0];
      if (!exit) break;
      if (s.player.x === exit.pos.x && s.player.y === exit.pos.y) {
        if (exitBlocked(s, exit.id)) applyAction(s, { type: 'wait' });
        else applyAction(s, { type: 'extract' });
        continue;
      }
      const st = stepToward(s, exit.pos, false);
      if (!st) break;
      walk(s, st);
      continue;
    }
    const c = todo[0];
    const near = Math.max(Math.abs(c.pos.x - s.player.x), Math.abs(c.pos.y - s.player.y)) === 1;
    if (near) {
      if (!c.searched) {
        if (c.locked) vault = true;
        applyAction(s, { type: 'search', containerId: c.id });
        continue;
      }
      // Leva os itens mais valiosos por peso que couberem.
      const order = c.items.map((it, i) => ({ it, i })).sort((a, b) => ITEMS[b.it].value / Math.max(0.5, ITEMS[b.it].weight) - ITEMS[a.it].value / Math.max(0.5, ITEMS[a.it].weight));
      let took = false;
      for (const { it } of order) {
        const idx = c.items.indexOf(it);
        if (carriedWeight(s) + ITEMS[it].weight <= capacity(s)) {
          applyAction(s, { type: 'take', containerId: c.id, index: idx });
          took = true;
          break;
        }
      }
      if (!took && c.name === vaultC?.name && s.backpack.length) {
        // Cofre aberto e mochila cheia: troca o item de menor valor pelo do cofre.
        const worst = s.backpack.map((it, i) => ({ it, i })).filter(({ it }) => it !== 'vault_key').sort((a, b) => ITEMS[a.it].value - ITEMS[b.it].value)[0];
        if (worst && ITEMS[worst.it].value < Math.max(...c.items.map((i) => ITEMS[i].value))) {
          applyAction(s, { type: 'drop', index: worst.i });
          continue;
        }
      }
      if (!took) c.items.length = 0; // nada mais cabe: ignora este móvel
      continue;
    }
    const st = stepToward(s, c.pos, true);
    if (!st) {
      c.items.length = 0;
      c.searched = true;
      continue;
    }
    walk(s, st);
  }
  const keyFound = s.containers.some((c) => c.searched && !c.locked && c.name) && (s.backpack.includes('vault_key') || vault);
  return { s, vault, keyFound, value: lootValue(s.backpack), keyAt: s.containers.findIndex((c) => c.items.includes('vault_key')) };
}

const N = 150;
for (let li = 0; li < LOCATIONS.length; li++) {
  const rows = [];
  for (let seed = 1; seed <= N; seed++) rows.push(play(seed * 7919 + li, li, seed % 3));
  const ok = rows.filter((r) => r.s.status === 'extracted');
  const dead = rows.filter((r) => r.s.status === 'dead').length;
  const stuck = rows.filter((r) => r.s.status === 'active').length;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(
    `${LOCATIONS[li].name.padEnd(22)} saiu ${String(ok.length).padStart(3)}/${N} · morreu ${String(dead).padStart(3)} · travou ${stuck} · turnos ${avg(ok.map((r) => r.s.turn)).toFixed(0)} · valor ${avg(ok.map((r) => r.value)).toFixed(1)} · abriu cofre ${rows.filter((r) => r.vault).length} · morreu antes do turno 20 ${rows.filter((r) => r.s.status === 'dead' && r.s.turn < 20).length} · vasculhou ${avg(rows.map((r) => r.s.containers.filter((c) => c.searched).length)).toFixed(1)}/${avg(rows.map((r) => r.s.containers.length)).toFixed(1)} · mortes de zumbi ${avg(rows.map((r) => r.s.kills)).toFixed(1)}`,
  );
}

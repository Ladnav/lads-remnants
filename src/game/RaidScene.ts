import Phaser from 'phaser';
import { idx } from '../sim/raid/grid';
import { computeVisible, exitStatus } from '../sim/raid/raid';
import type { RaidState, Vec } from '../sim/raid/types';

export const TILE = 28;

const C = {
  void: 0x0a0908,
  floorA: 0x2d2a25,
  floorB: 0x2a2722,
  wall: 0x5a544b,
  wallTop: 0x6d665b,
  door: 0x8b5a2b,
  doorLocked: 0x6e2f1c,
  doorFrame: 0x4a3218,
  container: 0x6b4f2a,
  containerEmpty: 0x3a2e20,
  exitOpen: 0xd9b45b,
  exitClosed: 0x5a5346,
  player: 0xe7e2d9,
  zombie: 0x5f7d2a,
  zombieChase: 0xe0573a,
  noise: 0xe0a83a,
};

/** Desenha o estado da incursão. Não guarda regras: só lê o estado e repassa cliques. */
export class RaidScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private onTileClick: (p: Vec) => void = () => {};
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('raid');
    this.onReady = onReady;
  }

  create(): void {
    this.gfx = this.add.graphics();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.onTileClick({ x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) });
    });
    this.onReady();
  }

  setTileClickHandler(fn: (p: Vec) => void): void {
    this.onTileClick = fn;
  }

  draw(s: RaidState): void {
    const g = this.gfx;
    g.clear();
    const vis = computeVisible(s);

    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = idx(s, x, y);
        const px = x * TILE;
        const py = y * TILE;
        if (!s.seen[i]) {
          g.fillStyle(C.void).fillRect(px, py, TILE, TILE);
          continue;
        }
        const t = s.tiles[i];
        if (t.kind === 'wall') {
          g.fillStyle(C.wall).fillRect(px, py, TILE, TILE);
          g.fillStyle(C.wallTop).fillRect(px, py, TILE, 6);
        } else {
          g.fillStyle((x + y) % 2 ? C.floorA : C.floorB).fillRect(px, py, TILE, TILE);
        }

        if (t.kind === 'door') {
          if (t.door === 'closed' || t.door === 'locked') {
            g.fillStyle(t.door === 'locked' ? C.doorLocked : C.door).fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
            if (t.door === 'locked') {
              g.fillStyle(C.exitOpen).fillCircle(px + TILE / 2, py + TILE / 2, 3);
            }
          } else {
            g.lineStyle(2, C.doorFrame).strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
            if (t.door === 'broken') {
              g.lineStyle(2, C.door).lineBetween(px + 6, py + 8, px + 14, py + 18).lineBetween(px + 16, py + 6, px + 22, py + 20);
            }
          }
        }

        if (t.kind === 'exit') {
          const open = exitStatus(s, t.exitId ?? '') === 'open';
          g.fillStyle(open ? C.exitOpen : C.exitClosed).fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          g.fillStyle(C.void).fillTriangle(px + TILE / 2, py + 8, px + 9, py + TILE - 9, px + TILE - 9, py + TILE - 9);
        }

        if (t.containerId !== undefined) {
          const c = s.containers[t.containerId];
          const empty = c.searched && c.items.length === 0;
          g.fillStyle(empty ? C.containerEmpty : C.container).fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
          g.lineStyle(1, 0x000000, 0.4).strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
          if (!c.searched) {
            g.fillStyle(C.exitOpen).fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
          } else if (c.items.length) {
            g.fillStyle(C.player).fillRect(px + TILE / 2 - 2, py + TILE / 2 - 2, 4, 4);
          }
        }

        if (!vis[i]) g.fillStyle(0x000000, 0.55).fillRect(px, py, TILE, TILE);
      }
    }

    for (const z of s.zombies) {
      if (!vis[idx(s, z.pos.x, z.pos.y)]) continue;
      const cx = z.pos.x * TILE + TILE / 2;
      const cy = z.pos.y * TILE + TILE / 2;
      g.fillStyle(C.zombie).fillCircle(cx, cy, TILE / 2 - 4);
      g.lineStyle(2, z.state === 'chasing' ? C.zombieChase : 0x2f3f14).strokeCircle(cx, cy, TILE / 2 - 4);
      const eye = z.state === 'chasing' ? C.zombieChase : 0x1a1a1a;
      g.fillStyle(eye).fillCircle(cx - 4, cy - 2, 2).fillCircle(cx + 4, cy - 2, 2);
    }

    const pcx = s.player.x * TILE + TILE / 2;
    const pcy = s.player.y * TILE + TILE / 2;
    if (s.status !== 'dead') {
      g.fillStyle(C.player).fillCircle(pcx, pcy, TILE / 2 - 4);
      g.lineStyle(2, C.exitOpen).strokeCircle(pcx, pcy, TILE / 2 - 4);
    } else {
      g.lineStyle(3, C.zombieChase).lineBetween(pcx - 8, pcy - 8, pcx + 8, pcy + 8).lineBetween(pcx + 8, pcy - 8, pcx - 8, pcy + 8);
    }

    this.rippleNoises(s, vis);
  }

  /** Ondas de ruído: mostram ao jogador o quanto cada ação "grita" pelo mapa. */
  private rippleNoises(s: RaidState, vis: boolean[]): void {
    for (const n of s.lastNoises) {
      if (!s.seen[idx(s, n.pos.x, n.pos.y)] && !vis[idx(s, n.pos.x, n.pos.y)]) continue;
      const ring = this.add.circle(n.pos.x * TILE + TILE / 2, n.pos.y * TILE + TILE / 2, TILE / 2);
      ring.setStrokeStyle(2, C.noise, 0.8);
      this.tweens.add({
        targets: ring,
        radius: n.radius * TILE,
        alpha: 0,
        duration: 450 + n.radius * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
  }
}

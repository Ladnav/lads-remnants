import Phaser from 'phaser';
import { idx } from '../sim/raid/grid';
import { computeVisible, exitStatus } from '../sim/raid/raid';
import type { RaidState, Tile, Vec } from '../sim/raid/types';
import { RES, TILE, WALL_H, box, feet, rowDepth, setupObliqueCamera, shade, wall } from './oblique';
import { Actor, survivorLook, zombieLook } from './sprites';

export { TILE } from './oblique';

const CONTAINER_COLOR: Record<string, number> = {
  Prateleira: 0x7a6a4a,
  Balcão: 0x8a5a3a,
  'Caixa de ferramentas': 0x9a3a2a,
  Armário: 0x5a6a7a,
};

/** Desenha o estado da incursão em 3/4. Não guarda regras: só lê o estado e repassa cliques. */
export class RaidScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Graphics[] = [];
  private player: Actor | null = null;
  private playerId = 'marta';
  private zombies = new Map<number, Actor>();
  private alerts = new Map<number, Phaser.GameObjects.Text>();
  private onTileClick: (p: Vec) => void = () => {};
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('raid');
    this.onReady = onReady;
  }

  create(): void {
    setupObliqueCamera(this);
    this.player = null;
    this.zombies.clear();
    this.alerts.clear();
    this.floor = this.add.graphics().setDepth(0);
    this.rows = [];
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.onTileClick({ x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) });
    });
    this.onReady();
  }

  /** Quem está na incursão: define o visual do boneco. */
  setPlayer(id: string): void {
    this.playerId = id;
  }

  setTileClickHandler(fn: (p: Vec) => void): void {
    this.onTileClick = fn;
  }

  draw(s: RaidState): void {
    while (this.rows.length < s.height) this.rows.push(this.add.graphics().setDepth(rowDepth(this.rows.length, 5)));
    const f = this.floor;
    f.clear();
    for (const g of this.rows) g.clear();
    const vis = computeVisible(s);
    f.fillStyle(0x0a0908).fillRect(0, -WALL_H, s.width * TILE, s.height * TILE + WALL_H);

    const at = (x: number, y: number): Tile | undefined =>
      x >= 0 && y >= 0 && x < s.width && y < s.height ? s.tiles[idx(s, x, y)] : undefined;
    const tall = (t: Tile | undefined) =>
      !!t && (t.kind === 'wall' || (t.kind === 'door' && (t.door === 'closed' || t.door === 'locked')));

    for (let y = 0; y < s.height; y++) {
      const g = this.rows[y];
      for (let x = 0; x < s.width; x++) {
        const i = idx(s, x, y);
        const px = x * TILE;
        const py = y * TILE;
        const t = s.tiles[i];
        if (!s.seen[i]) {
          g.fillStyle(0x0a0908).fillRect(px, py, TILE, TILE);
          continue;
        }

        if (t.kind !== 'wall') {
          // Piso de cerâmica velha
          f.fillStyle((x + y) % 2 ? 0x3a372f : 0x36332b).fillRect(px, py, TILE, TILE);
          f.lineStyle(1, 0x2a2822, 0.8).strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          if ((x * 5 + y * 3) % 11 === 0) f.fillStyle(0x2e2b24).fillEllipse(px + 10, py + 16, 10, 5);
        }

        if (t.kind === 'wall') {
          wall(g, x, y, !tall(at(x, y + 1)));
        } else if (t.kind === 'door') {
          const closed = t.door === 'closed' || t.door === 'locked';
          if (closed) {
            const wood = t.door === 'locked' ? 0x6e2f1c : 0x7a4a24;
            g.fillStyle(shade(wood, 0.7)).fillRect(px, py - WALL_H, TILE, TILE);
            g.fillStyle(wood).fillRect(px + 2, py + TILE - WALL_H - 8, TILE - 4, WALL_H + 8);
            g.lineStyle(1, shade(wood, 0.6)).lineBetween(px + TILE / 2, py + TILE - WALL_H - 8, px + TILE / 2, py + TILE);
            if (t.door === 'locked') g.fillStyle(0xd9b45b).fillRect(px + TILE / 2 - 2, py + TILE - 12, 4, 4);
          } else {
            // Batentes nas laterais: dá para ver que é uma passagem.
            box(g, px, py + TILE - 6, 4, 6, WALL_H + 6, 0x5a4a3a);
            box(g, px + TILE - 4, py + TILE - 6, 4, 6, WALL_H + 6, 0x5a4a3a);
            if (t.door === 'broken') {
              f.lineStyle(2, 0x7a4a24).lineBetween(px + 5, py + 8, px + 13, py + 20).lineBetween(px + 16, py + 6, px + 23, py + 18);
            }
          }
        } else if (t.kind === 'exit') {
          const open = exitStatus(s, t.exitId ?? '') === 'open';
          const c = open ? 0xd9b45b : 0x6a6355;
          if (t.exitId === 'roof') {
            // Escada encostada: dois trilhos e degraus subindo.
            box(g, px + 6, py + 18, 3, 4, 34, c);
            box(g, px + TILE - 9, py + 18, 3, 4, 34, c);
            for (let k = 0; k < 4; k++) g.fillStyle(c).fillRect(px + 7, py + 14 - k * 8, TILE - 14, 2);
          } else {
            f.fillStyle(open ? 0x5a4a20 : 0x2a2620).fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
            f.fillStyle(c).fillTriangle(px + TILE / 2, py + 22, px + 8, py + 10, px + TILE - 8, py + 10);
          }
        }

        if (t.containerId !== undefined) {
          const c = s.containers[t.containerId];
          const empty = c.searched && c.items.length === 0;
          const color = empty ? 0x3a3128 : (CONTAINER_COLOR[c.name] ?? 0x6b4f2a);
          const h = c.name === 'Prateleira' || c.name === 'Armário' ? 18 : 11;
          box(g, px + 3, py + 6, TILE - 6, TILE - 10, h, color);
          const topY = py + 6 - h + (TILE - 10) / 2;
          if (!c.searched) g.fillStyle(0xd9b45b).fillCircle(px + TILE / 2, topY, 3);
          else if (c.items.length) g.fillStyle(0xf1ebe0).fillCircle(px + TILE / 2, topY, 3);
        }

        if (!vis[i]) {
          const raised = tall(t) || t.containerId !== undefined || (t.kind === 'exit' && t.exitId === 'roof');
          g.fillStyle(0x000000, 0.55).fillRect(px, py - (raised ? WALL_H + 20 : 0), TILE, TILE + (raised ? WALL_H + 20 : 0));
        }
      }
    }

    this.drawActors(s, vis);
    this.rippleNoises(s, vis);
  }

  private drawActors(s: RaidState, vis: boolean[]): void {
    if (!this.player) {
      this.player = new Actor(this, survivorLook(this.playerId));
      const p = feet(s.player.x, s.player.y);
      this.player.container.setPosition(p.x, p.y);
      // Câmera próxima, seguindo o sobrevivente: a névoa esconde o resto mesmo.
      this.cameras.main
        .setBounds(0, -WALL_H, s.width * TILE, s.height * TILE + WALL_H)
        .setOrigin(0.5, 0.5)
        .setZoom(1.7 * RES)
        .startFollow(this.player.container, true, 0.12, 0.12, 0, 10);
    }
    this.moveTo(this.player, s.player);
    if (s.status === 'dead') {
      this.player.setPose('floor');
      this.player.container.setAlpha(0.7);
    }

    for (const [id, c] of this.zombies) {
      if (!s.zombies.some((z) => z.id === id)) {
        c.container.destroy();
        this.zombies.delete(id);
        this.alerts.delete(id);
      }
    }
    for (const z of s.zombies) {
      let c = this.zombies.get(z.id);
      if (!c) {
        c = new Actor(this, zombieLook(z.kind));
        const alert = this.add.text(0, -44, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#e0573a', fontStyle: 'bold' }).setOrigin(0.5);
        c.container.add(alert);
        this.alerts.set(z.id, alert);
        const p = feet(z.pos.x, z.pos.y);
        c.container.setPosition(p.x, p.y);
        this.zombies.set(z.id, c);
      }
      c.container.setVisible(vis[idx(s, z.pos.x, z.pos.y)]);
      this.alerts.get(z.id)!.setVisible(z.state === 'chasing');
      this.moveTo(c, z.pos);
    }
  }

  private moveTo(a: Actor, pos: Vec): void {
    const c = a.container;
    const p = feet(pos.x, pos.y);
    c.setDepth(rowDepth(pos.y, 7));
    if (c.x === p.x && c.y === p.y) return;
    this.tweens.killTweensOf(c);
    a.faceDelta(p.x - c.x, p.y - c.y);
    a.setWalking(true);
    this.tweens.add({ targets: c, x: p.x, y: p.y, duration: 160, ease: 'Sine.easeOut', onComplete: () => a.setWalking(false) });
  }

  /** Ondas de ruído achatadas pela perspectiva. */
  private rippleNoises(s: RaidState, vis: boolean[]): void {
    for (const n of s.lastNoises) {
      if (!s.seen[idx(s, n.pos.x, n.pos.y)] && !vis[idx(s, n.pos.x, n.pos.y)]) continue;
      const p = feet(n.pos.x, n.pos.y);
      const ring = this.add.ellipse(p.x, p.y, TILE, TILE * 0.6).setStrokeStyle(2, 0xe0a83a, 0.85).setDepth(100000);
      this.tweens.addCounter({
        from: 1,
        to: n.radius * 2,
        duration: 450 + n.radius * 60,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          ring.setSize(TILE * k, TILE * 0.6 * k).setPosition(p.x, p.y);
          ring.setAlpha(1 - tw.progress);
        },
        onComplete: () => ring.destroy(),
      });
    }
  }
}

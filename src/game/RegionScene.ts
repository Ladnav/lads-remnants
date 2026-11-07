import Phaser from 'phaser';
import { LOCATIONS, SHELTER_POS } from '../data/shelter';
import { hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState } from '../sim/shelter/types';
import { TILE } from './RaidScene';

const W = 28;
const H = 20;
const DANGER_COLOR = { 1: 0xd9b45b, 2: 0xe69138, 3: 0xe0573a } as const;

const center = (p: [number, number]) => ({ x: p[0] * TILE + TILE / 2, y: p[1] * TILE + TILE / 2 });

/** Mapa da cidade: locais conhecidos, desconhecidos e o caminho das expedições. */
export class RegionScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private pulses: Phaser.GameObjects.GameObject[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private onSelect: (id: string) => void = () => {};
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('region');
    this.onReady = onReady;
  }

  setSelectHandler(fn: (id: string) => void): void {
    this.onSelect = fn;
  }

  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.labels = [];
    this.pulses = [];
    this.drawCity();
    this.gfx = this.add.graphics();
    this.night = this.add.rectangle(0, 0, W * TILE, H * TILE, 0x0b1630, 0).setOrigin(0).setDepth(40);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      let best: string | null = null;
      let bestD = TILE * 1.4;
      for (const l of LOCATIONS) {
        const c = center(l.pos);
        const d = Math.hypot(c.x - p.worldX, c.y - p.worldY);
        if (d < bestD) {
          bestD = d;
          best = l.id;
        }
      }
      if (best) this.onSelect(best);
    });
    this.onReady();
  }

  /** Ruas, quarteirões e um rio: fixo, desenhado uma vez. */
  private drawCity(): void {
    const g = this.add.graphics();
    g.fillStyle(0x1c1a17).fillRect(0, 0, W * TILE, H * TILE);
    for (let by = 0; by < H; by += 4) {
      for (let bx = 0; bx < W; bx += 5) {
        // Quarteirões com prédios de tamanhos variados (pseudo-aleatório fixo).
        const seed = (bx * 31 + by * 17) % 7;
        const shade = [0x2b2823, 0x2f2b25, 0x27241f][seed % 3];
        g.fillStyle(shade).fillRect(bx * TILE + 6, by * TILE + 6, 4 * TILE - 12, 3 * TILE - 12);
        if (seed > 2) {
          g.fillStyle(0x34302a).fillRect(bx * TILE + 14, by * TILE + 12, TILE * 1.5, TILE * 1.2);
          g.fillStyle(0x34302a).fillRect(bx * TILE + TILE * 2.2, by * TILE + TILE * 1.4, TILE * 1.4, TILE);
        }
      }
    }
    // Ruas principais
    g.fillStyle(0x24221e);
    for (let y = 3; y < H; y += 4) g.fillRect(0, y * TILE + 4, W * TILE, TILE - 8);
    for (let x = 4; x < W; x += 5) g.fillRect(x * TILE + 4, 0, TILE - 8, H * TILE);
    g.lineStyle(1, 0x3a362f, 0.6);
    for (let y = 3; y < H; y += 4) g.lineBetween(0, y * TILE + TILE / 2, W * TILE, y * TILE + TILE / 2);
    // Rio cortando a cidade
    g.lineStyle(TILE * 0.9, 0x1d3140, 1);
    g.beginPath();
    g.moveTo(W * TILE * 0.55, 0);
    g.lineTo(W * TILE * 0.62, H * TILE * 0.35);
    g.lineTo(W * TILE * 0.58, H * TILE * 0.7);
    g.lineTo(W * TILE * 0.66, H * TILE);
    g.strokePath();
    // Praça perto do abrigo
    g.fillStyle(0x23301d).fillRect((SHELTER_POS[0] - 2) * TILE, (SHELTER_POS[1] - 1) * TILE, TILE * 4, TILE * 3);
  }

  draw(s: ShelterState, selected: string | null): void {
    const g = this.gfx;
    g.clear();
    for (const o of [...this.labels, ...this.pulses]) o.destroy();
    this.labels = [];
    this.pulses = [];
    const home = center(SHELTER_POS);

    // Caminhos das expedições
    for (const e of s.expeditions) {
      const l = LOCATIONS.find((x) => x.id === e.locationId)!;
      const to = center(l.pos);
      const color = e.emergency?.state === 'pending' ? 0xe0573a : 0xd9b45b;
      dashed(g, home.x, home.y, to.x, to.y, color, e.departed ? 1 : 0.5);
      if (e.departed) {
        const who = s.survivors.filter((v) => v.expeditionId === e.id).map((v) => v.name[0]).join('');
        if (who) {
          const mid = { x: to.x + 20, y: to.y - 20 };
          g.fillStyle(0xe7e2d9).fillCircle(mid.x, mid.y, 10);
          this.labels.push(this.add.text(mid.x, mid.y, who, { fontFamily: 'monospace', fontSize: '11px', color: '#1a1712', fontStyle: 'bold' }).setOrigin(0.5).setDepth(5));
        }
      }
    }

    // Abrigo
    g.fillStyle(0x4a3a26).fillCircle(home.x, home.y, 18);
    g.lineStyle(2, 0x8fbf5a).strokeCircle(home.x, home.y, 18);
    this.labels.push(this.add.text(home.x, home.y, '🏠', { fontSize: '18px' }).setOrigin(0.5).setDepth(5));
    this.label(home.x, home.y + 22, 'Abrigo', '#8fbf5a');

    for (const l of LOCATIONS) {
      const c = center(l.pos);
      const known = s.discovered.includes(l.id);
      if (!known) {
        g.fillStyle(0x161512).fillCircle(c.x, c.y, 16);
        g.lineStyle(1, 0x5a544b).strokeCircle(c.x, c.y, 16);
        this.labels.push(this.add.text(c.x, c.y, '?', { fontFamily: 'monospace', fontSize: '16px', color: '#5a544b' }).setOrigin(0.5).setDepth(5));
        this.label(c.x, c.y + 20, '???', '#5a544b');
        continue;
      }
      g.fillStyle(0x2b2620).fillCircle(c.x, c.y, 17);
      g.lineStyle(selected === l.id ? 3 : 2, selected === l.id ? 0xe7e2d9 : DANGER_COLOR[l.danger]).strokeCircle(c.x, c.y, 17);
      this.labels.push(this.add.text(c.x, c.y, l.icon, { fontSize: '17px' }).setOrigin(0.5).setDepth(5));
      this.label(c.x, c.y + 21, `${l.name}  ${'☠'.repeat(l.danger)}`, '#e7e2d9');
      const stock = (s.locationStock[l.id] ?? 100) / 100;
      g.fillStyle(0x34302a).fillRect(c.x - 20, c.y + 36, 40, 4);
      g.fillStyle(stock > 0.5 ? 0x8fbf5a : stock > 0.25 ? 0xe0a83a : 0xe0573a).fillRect(c.x - 20, c.y + 36, 40 * stock, 4);

      if (s.expeditions.some((e) => e.locationId === l.id && e.emergency?.state === 'pending')) {
        const ring = this.add.circle(c.x, c.y, 18).setStrokeStyle(3, 0xe0573a).setDepth(6);
        this.tweens.add({ targets: ring, radius: 34, alpha: 0, duration: 900, repeat: -1 });
        this.pulses.push(ring);
        this.pulses.push(this.add.text(c.x - 22, c.y - 30, '🚨', { fontSize: '16px' }).setDepth(7));
      }
    }

    const h = hourOfDay(s.hour);
    this.night.setFillStyle(0x0b1630, isNight(h) ? 0.45 : h === 20 || h === 6 ? 0.2 : 0);
  }

  private label(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '10px', color, backgroundColor: '#0f0e0ccc', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 0)
      .setDepth(5);
    this.labels.push(t);
  }
}

function dashed(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.floor(len / 10);
  g.lineStyle(2, color, alpha);
  for (let i = 0; i < steps; i += 2) {
    const a = i / steps;
    const b = Math.min(1, (i + 1) / steps);
    g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
}

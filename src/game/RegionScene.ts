import Phaser from 'phaser';
import { LOCATIONS, SHELTER_POS } from '../data/shelter';
import { hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState } from '../sim/shelter/types';
import { TILE, WALL_H, box, setupObliqueCamera, shade } from './oblique';
import { Actor, survivorLook } from './sprites';

const W = 28;
const H = 20;
const DANGER_COLOR = { 1: 0xd9b45b, 2: 0xe69138, 3: 0xe0573a } as const;
const ROOF_COLOR: Record<string, number> = {
  market: 0xb5523b,
  garage: 0x5f6f7a,
  pharmacy: 0x3f8a6a,
  hospital: 0xd8d2c4,
  police: 0x34507a,
};
const RIVER_X = 14;

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

/** Prédio de cada local: 3 tiles de largura, 1,5 de fundo, centrado no ponto do local. */
const landmark = (p: [number, number]): Rect => ({ x: p[0] * TILE - TILE, y: p[1] * TILE - TILE * 0.5, w: TILE * 3, d: TILE * 1.5 });
const center = (p: [number, number]) => ({ x: p[0] * TILE + TILE / 2, y: p[1] * TILE + TILE / 2 });
const overlaps = (a: Rect, b: Rect, pad = 6) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.d + pad && a.y + a.d + pad > b.y;

/** Mapa da cidade em 3/4: quarteirões, rio, prédios dos locais e as rotas das expedições. */
export class RegionScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private gfx!: Phaser.GameObjects.Graphics;
  private routes!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
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

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.labels = [];
    setupObliqueCamera(this);
    this.drawCity();
    this.gfx = this.add.graphics().setDepth(20);
    this.routes = this.add.graphics().setDepth(30);
    this.night = this.add.rectangle(0, -WALL_H, W * TILE, H * TILE + WALL_H, 0x0b1630, 0).setOrigin(0).setDepth(1000);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hit = LOCATIONS.find((l) => {
        const r = landmark(l.pos);
        return p.worldX >= r.x && p.worldX <= r.x + r.w && p.worldY >= r.y - 30 && p.worldY <= r.y + r.d + 18;
      });
      if (hit) this.onSelect(hit.id);
    });
    this.onReady();
  }

  /** Chão, ruas, rio e prédios genéricos: fixo, desenhado uma vez. */
  private drawCity(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x2a2823).fillRect(0, -WALL_H, W * TILE, H * TILE + WALL_H);
    // Calçadas dos quarteirões
    for (let by = 0; by < H; by += 4) {
      for (let bx = 0; bx < W; bx += 5) {
        g.fillStyle(0x3a372f).fillRect(bx * TILE + 3, by * TILE + 3, 4 * TILE - 6, 3 * TILE - 6);
      }
    }
    // Faixas das ruas
    g.lineStyle(2, 0x6a6352, 0.5);
    for (let y = 3; y < H; y += 4) for (let x = 0; x < W * TILE; x += 22) g.lineBetween(x, y * TILE + TILE / 2, x + 10, y * TILE + TILE / 2);
    // Rio no lugar de uma avenida, com pontes nas ruas
    g.fillStyle(0x1f3a4d).fillRect(RIVER_X * TILE - 8, -WALL_H, TILE + 16, H * TILE + WALL_H);
    g.fillStyle(0x2c5068).fillRect(RIVER_X * TILE - 2, -WALL_H, 4, H * TILE + WALL_H);
    for (let y = 3; y < H; y += 4) {
      g.fillStyle(0x5a5346).fillRect(RIVER_X * TILE - 10, y * TILE + 2, TILE + 20, TILE - 4);
      g.fillStyle(0x6d665b).fillRect(RIVER_X * TILE - 10, y * TILE + 2, TILE + 20, 3).fillRect(RIVER_X * TILE - 10, y * TILE + TILE - 5, TILE + 20, 3);
    }
    // Praça do abrigo
    const sq = { x: (SHELTER_POS[0] - 2) * TILE, y: (SHELTER_POS[1] - 1) * TILE };
    g.fillStyle(0x3b4a24).fillRect(sq.x, sq.y, TILE * 4, TILE * 3);

    const reserved: Rect[] = [...LOCATIONS.map((l) => landmark(l.pos)), { x: sq.x, y: sq.y - TILE, w: TILE * 4, d: TILE * 4 }];
    const b = this.add.graphics().setDepth(10);
    const roofs = [0x5a4a3c, 0x4e4a44, 0x63503a, 0x4a5058, 0x5c5246];
    for (let by = 0; by < H; by += 4) {
      for (let bx = 0; bx < W; bx += 5) {
        if (bx <= RIVER_X && bx + 4 > RIVER_X) continue;
        const seed = (bx * 31 + by * 17) % 7;
        const parts = seed % 2 ? [[0, 2], [2, 2]] : [[0, 4]];
        for (const [ox, ow] of parts) {
          const r: Rect = { x: (bx + ox) * TILE + 6, y: by * TILE + 10, w: ow * TILE - 10, d: TILE * 2 - 8 };
          if (r.x + r.w > W * TILE || reserved.some((q) => overlaps(q, r))) continue;
          const h = 14 + ((seed + ox) % 3) * 6;
          const roof = roofs[(seed + ox) % roofs.length];
          box(b, r.x, r.y + h, r.w, r.d, h, roof, true, shade(roof, 0.55));
          // Janelas na fachada
          for (let wx = r.x + 5; wx < r.x + r.w - 6; wx += 9) b.fillStyle(0x1c1a17).fillRect(wx, r.y + r.d + 3, 4, 5);
        }
      }
    }
  }

  draw(s: ShelterState, selected: string | null): void {
    const g = this.gfx;
    const r = this.routes;
    g.clear();
    r.clear();
    for (const o of this.labels) o.destroy();
    this.labels = [];
    const home = center(SHELTER_POS);

    // Abrigo: casa com telhado e muro
    const hx = SHELTER_POS[0] * TILE - TILE * 0.7;
    const hy = SHELTER_POS[1] * TILE - TILE * 0.2;
    box(g, hx, hy + 20, TILE * 2.4, TILE * 1.3, 20, 0x6a8a3a, true, 0x8a6a4a);
    g.fillStyle(0x3a2a1a).fillRect(hx + TILE * 1.05, hy + TILE * 1.3 + 8, 10, 12);
    this.text(home.x, hy - 6, '🏠', 16, 25);
    this.label(home.x, hy + TILE * 1.3 + 22, 'Abrigo', '#8fbf5a');

    for (const l of LOCATIONS) {
      const rect = landmark(l.pos);
      const known = s.discovered.includes(l.id);
      const h = 24 + l.danger * 4;
      if (!known) {
        box(g, rect.x, rect.y + h, rect.w, rect.d, h, 0x2a2824, true, 0x1c1b18);
        this.text(rect.x + rect.w / 2, rect.y + rect.d / 2, '?', 18, 25, '#6a6355');
        this.label(rect.x + rect.w / 2, rect.y + rect.d + h + 2, '???', '#6a6355');
        continue;
      }
      const roof = ROOF_COLOR[l.id] ?? 0x6a5a4a;
      box(g, rect.x, rect.y + h, rect.w, rect.d, h, roof, true, shade(roof, 0.5));
      for (let wx = rect.x + 6; wx < rect.x + rect.w - 8; wx += 11) g.fillStyle(0x15140f).fillRect(wx, rect.y + rect.d + 4, 5, 7);
      // Contorno: cor do perigo, ou clara se selecionado.
      g.lineStyle(selected === l.id ? 3 : 2, selected === l.id ? 0xf1ebe0 : DANGER_COLOR[l.danger]).strokeRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.d + h + 2);
      this.text(rect.x + rect.w / 2, rect.y + rect.d / 2, l.icon, 17, 25);
      this.label(rect.x + rect.w / 2, rect.y + rect.d + h + 2, `${l.name} ${'💀'.repeat(l.danger)}`, '#f1ebe0');
      const stock = (s.locationStock[l.id] ?? 100) / 100;
      const sy = rect.y + rect.d + h + 18;
      g.fillStyle(0x1c1a17).fillRect(rect.x + rect.w / 2 - 22, sy, 44, 4);
      g.fillStyle(stock > 0.5 ? 0x8fbf5a : stock > 0.25 ? 0xe0a83a : 0xe0573a).fillRect(rect.x + rect.w / 2 - 22, sy, 44 * stock, 4);

      if (s.expeditions.some((e) => e.locationId === l.id && e.emergency?.state === 'pending')) {
        const ring = this.add.ellipse(rect.x + rect.w / 2, rect.y + rect.d / 2, rect.w + 10, rect.d + 10).setStrokeStyle(3, 0xe0573a).setDepth(26);
        this.tweens.add({ targets: ring, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 900, repeat: -1 });
        this.labels.push(ring);
        this.text(rect.x - 4, rect.y - 8, '🚨', 16, 27);
      }
    }

    // Rotas das expedições por cima dos prédios
    for (const e of s.expeditions) {
      const l = LOCATIONS.find((x) => x.id === e.locationId)!;
      const to = center(l.pos);
      const color = e.emergency?.state === 'pending' ? 0xe0573a : 0xd9b45b;
      dashed(r, home.x, home.y, to.x, to.y, color, e.departed ? 1 : 0.5);
      if (e.departed) {
        // Primeiro quarto da noite indo, último quarto voltando; no meio, no local.
        const t = Phaser.Math.Clamp((s.hour - e.departHour) / Math.max(1, e.returnHour - e.departHour), 0, 1);
        const k = e.emergency ? 1 : t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
        const site = { x: to.x + TILE * 1.9, y: to.y + 10 };
        const members = s.survivors.filter((v) => v.expeditionId === e.id);
        members.forEach((v, i) => {
          const a = new Actor(this, survivorLook(v.id));
          a.container.setPosition(home.x + (site.x - home.x) * k + i * 13, home.y + 10 + (site.y - home.y - 10) * k).setDepth(31);
          if (k < 1) {
            const dir = t < 0.5 ? 1 : -1;
            a.faceDelta((site.x - home.x) * dir, (site.y - home.y) * dir);
            a.setWalking(true);
          }
          this.labels.push(a.container);
        });
      }
    }

    const hr = hourOfDay(s.hour);
    this.night.setFillStyle(0x0b1630, isNight(hr) ? 0.45 : hr === 20 || hr === 6 ? 0.2 : 0);
  }

  private text(x: number, y: number, t: string, size: number, depth: number, color = '#f1ebe0'): void {
    this.labels.push(
      this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth),
    );
  }

  private label(x: number, y: number, text: string, color: string): void {
    this.labels.push(
      this.add
        .text(x, y, text, { fontFamily: 'monospace', fontSize: '10px', color, backgroundColor: '#0f0e0cd9', padding: { x: 3, y: 1 } })
        .setOrigin(0.5, 0)
        .setDepth(28),
    );
  }
}

function dashed(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.floor(len / 10);
  g.lineStyle(3, color, alpha);
  for (let i = 0; i < steps; i += 2) {
    const a = i / steps;
    const b = Math.min(1, (i + 1) / steps);
    g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
}

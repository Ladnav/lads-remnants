import Phaser from 'phaser';
import { LOCATIONS, SHELTER_POS } from '../data/shelter';
import { hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState } from '../sim/shelter/types';
import { ensureIcon, iconFor } from './icons';
import { NightLight, makeRain, type LightSource } from './night';
import { TAP_SLOP, TILE, WALL_H, box, enablePan, setupObliqueCamera, shade } from './oblique';
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
  private night!: NightLight;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
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
    // No celular começa olhando para o abrigo e os locais mais próximos.
    enablePan(this, W * TILE, H * TILE, { x: (SHELTER_POS[0] + 3) * TILE, y: (SHELTER_POS[1] - 4) * TILE });
    this.drawCity();
    this.gfx = this.add.graphics().setDepth(20);
    this.routes = this.add.graphics().setDepth(30);
    this.night = new NightLight(this, W * TILE, H * TILE + WALL_H);
    this.rain = makeRain(this, 0, -WALL_H - 40, W * TILE + 40, H * TILE, 8);
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.night.flicker() });
    // Escolhe no soltar, e só se o dedo não arrastou o mapa.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > TAP_SLOP) return;
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
    // Asfalto gasto: remendos, rachaduras e mato nas calçadas.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const h = spot(x, y);
        const street = y % 4 === 3 || x % 5 === 4;
        if (street) {
          if (h % 4 === 0) g.fillStyle(0x23211d, 0.8).fillEllipse(x * TILE + 6 + (h % 14), y * TILE + 8 + (h % 11), 14 + (h % 9), 7);
          if (h % 9 === 0) g.lineStyle(1, 0x191815, 0.9).lineBetween(x * TILE + (h % 12), y * TILE + 3, x * TILE + 10 + (h % 14), y * TILE + TILE - 4);
          if (h % 23 === 0) g.fillStyle(0x141311).fillCircle(x * TILE + 14, y * TILE + 14, 4).lineStyle(1, 0x4a4840).strokeCircle(x * TILE + 14, y * TILE + 14, 4);
        } else if (h % 3 === 0) {
          g.fillStyle(h % 2 ? 0x3f4a2a : 0x34362c, 0.8).fillRect(x * TILE + (h % 22), y * TILE + ((h >> 2) % 20), 3, 2 + (h % 3));
        }
      }
    }
    // Carros largados no meio da rua.
    const cars: [number, number, number][] = [[2, 3, 0x6b3a32], [11, 7, 0x4a5560], [21, 11, 0x6a6452], [7, 15, 0x3f4f44], [17, 3, 0x56443a], [25, 15, 0x4a4a52], [9, 11, 0x5a3f3a]];
    for (const [cx, cy, color] of cars) {
      const px = cx * TILE + 3;
      const py = cy * TILE + 9;
      g.fillStyle(0x000000, 0.35).fillRect(px + 3, py + 11, 22, 4);
      box(g, px, py + 5, 22, 10, 5, color);
      g.fillStyle(0x1c2226).fillRect(px + 5, py + 1, 12, 5);
    }
    // Faixas das ruas
    g.lineStyle(2, 0x6a6352, 0.5);
    for (let y = 3; y < H; y += 4) for (let x = 0; x < W * TILE; x += 22) g.lineBetween(x, y * TILE + TILE / 2, x + 10, y * TILE + TILE / 2);
    // Rio no lugar de uma avenida, com pontes nas ruas
    g.fillStyle(0x1f3a4d).fillRect(RIVER_X * TILE - 8, -WALL_H, TILE + 16, H * TILE + WALL_H);
    g.fillStyle(0x2c5068).fillRect(RIVER_X * TILE - 2, -WALL_H, 4, H * TILE + WALL_H);
    for (let y = 0; y < H * 2; y++) {
      const h = spot(y, 99);
      g.fillStyle(0x3a6682, 0.6).fillRect(RIVER_X * TILE - 4 + (h % 30), y * 14 - WALL_H + (h % 9), 6 + (h % 5), 1);
    }
    // Margens escuras do rio.
    g.fillStyle(0x000000, 0.3).fillRect(RIVER_X * TILE - 8, -WALL_H, 3, H * TILE + WALL_H).fillRect(RIVER_X * TILE + TILE + 5, -WALL_H, 3, H * TILE + WALL_H);
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
          shadow(b, r, h);
          box(b, r.x, r.y + h, r.w, r.d, h, roof, true, shade(roof, 0.55));
          // Caixa d'água e remendo no telhado.
          b.fillStyle(shade(roof, 0.8)).fillRect(r.x + 5 + ((seed * 7) % Math.max(4, r.w - 22)), r.y + 5, 9, 7);
          if ((seed + ox) % 2) b.fillStyle(shade(roof, 1.15)).fillRect(r.x + r.w - 14, r.y + r.d - 12, 8, 6);
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
    shadow(g, { x: hx, y: hy, w: TILE * 2.4, d: TILE * 1.3 }, 20);
    box(g, hx, hy + 20, TILE * 2.4, TILE * 1.3, 20, 0x8a4a3a, true, 0x8a6a4a);
    g.fillStyle(0x3a2a1a).fillRect(hx + TILE * 1.05, hy + TILE * 1.3 + 8, 10, 12);
    // Janela acesa: tem gente em casa.
    g.fillStyle(0xe0a04a).fillRect(hx + 8, hy + TILE * 1.3 + 7, 7, 7);
    this.ico(home.x, hy - 10, 'home', 18, 25);
    this.label(home.x, hy + TILE * 1.3 + 22, 'Abrigo', '#8fbf5a');

    for (const l of LOCATIONS) {
      const rect = landmark(l.pos);
      const known = s.discovered.includes(l.id);
      const h = 24 + l.danger * 4;
      if (!known) {
        shadow(g, rect, h);
        box(g, rect.x, rect.y + h, rect.w, rect.d, h, 0x2a2824, true, 0x1c1b18);
        this.text(rect.x + rect.w / 2, rect.y + rect.d / 2, '?', 18, 25, '#6a6355');
        this.label(rect.x + rect.w / 2, rect.y + rect.d + h + 2, '???', '#6a6355');
        continue;
      }
      const roof = ROOF_COLOR[l.id] ?? 0x6a5a4a;
      shadow(g, rect, h);
      box(g, rect.x, rect.y + h, rect.w, rect.d, h, roof, true, shade(roof, 0.5));
      for (let wx = rect.x + 6; wx < rect.x + rect.w - 8; wx += 11) g.fillStyle(0x15140f).fillRect(wx, rect.y + rect.d + 4, 5, 7);
      // Contorno: cor do perigo, ou clara se selecionado.
      g.lineStyle(selected === l.id ? 3 : 2, selected === l.id ? 0xf1ebe0 : DANGER_COLOR[l.danger]).strokeRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.d + h + 2);
      this.ico(rect.x + rect.w / 2, rect.y + rect.d / 2, iconFor(l.icon) ?? 'map', 22, 25);
      const name = this.label(rect.x + rect.w / 2 - l.danger * 5, rect.y + rect.d + h + 2, l.name, '#f1ebe0');
      for (let i = 0; i < l.danger; i++) this.ico(name.x + name.width / 2 + 8 + i * 11, name.y + 7, 'skull', 11, 28);
      const stock = (s.locationStock[l.id] ?? 100) / 100;
      const sy = rect.y + rect.d + h + 18;
      g.fillStyle(0x1c1a17).fillRect(rect.x + rect.w / 2 - 22, sy, 44, 4);
      g.fillStyle(stock > 0.5 ? 0x8fbf5a : stock > 0.25 ? 0xe0a83a : 0xe0573a).fillRect(rect.x + rect.w / 2 - 22, sy, 44 * stock, 4);

      if (s.expeditions.some((e) => e.locationId === l.id && e.emergency?.state === 'pending')) {
        const ring = this.add.ellipse(rect.x + rect.w / 2, rect.y + rect.d / 2, rect.w + 10, rect.d + 10).setStrokeStyle(3, 0xe0573a).setDepth(26);
        this.tweens.add({ targets: ring, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 900, repeat: -1 });
        this.labels.push(ring);
        this.ico(rect.x - 4, rect.y - 8, 'siren', 18, 27);
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

    // À noite só se vê o abrigo e onde há gente de lanterna.
    const hr = hourOfDay(s.hour);
    const lights: LightSource[] = [{ x: home.x, y: home.y + 6, r: 105 }];
    for (const e of s.expeditions) {
      if (!e.departed) continue;
      const to = center(LOCATIONS.find((x) => x.id === e.locationId)!.pos);
      lights.push({ x: to.x + TILE, y: to.y + 6, r: 80 });
    }
    this.night.set(isNight(hr) ? 0.62 : hr === 20 || hr === 6 ? 0.32 : 0, lights);
    if (this.rain.emitting !== s.raining) s.raining ? this.rain.start() : this.rain.stop();
  }

  private ico(x: number, y: number, name: string, size: number, depth: number): void {
    this.labels.push(this.add.image(x, y, ensureIcon(this, name)).setDisplaySize(size, size).setDepth(depth));
  }

  private text(x: number, y: number, t: string, size: number, depth: number, color = '#f1ebe0'): void {
    this.labels.push(
      this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth),
    );
  }

  private label(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, text, { fontFamily: '"Special Elite", monospace', fontSize: '10px', color, backgroundColor: '#0f0e0cd9', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 0)
      .setDepth(28);
    this.labels.push(t);
    return t;
  }
}

/** Número estável por tile, para variar o chão sem sortear a cada desenho. */
const spot = (x: number, y: number): number => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000;

/** Sombra que o prédio joga no chão, para baixo e para a direita. */
function shadow(g: Phaser.GameObjects.Graphics, r: Rect, h: number): void {
  g.fillStyle(0x000000, 0.32).fillRect(r.x + 5, r.y + r.d + h, r.w, 5);
  g.fillStyle(0x000000, 0.32).fillRect(r.x + r.w, r.y + 8, 5, r.d + h - 3);
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

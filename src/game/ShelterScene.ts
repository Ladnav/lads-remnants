import Phaser from 'phaser';
import { RECIPES } from '../data/shelter';
import { emotionOf, hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState, ShelterSurvivor } from '../sim/shelter/types';
import { TILE, WALL_H, box, feet, figure, rowDepth, setupObliqueCamera, wall } from './oblique';

const W = 28;
const H = 20;

type P = [number, number];

/** Planta fixa da casa: paredes internas com vãos de passagem. */
const WALLS: [P, P][] = [
  [[10, 1], [10, 7]],
  [[18, 1], [18, 18]],
  [[0, 8], [17, 8]],
  [[0, 14], [17, 14]],
  [[6, 15], [6, 18]],
];
const GAPS: P[] = [[10, 4], [18, 4], [18, 11], [5, 8], [14, 8], [3, 14], [12, 14], [6, 17]];
const FRONT_DOOR: P = [12, 19];

const ROOMS: { name: string; at: P }[] = [
  { name: 'DORMITÓRIO', at: [1, 1] },
  { name: 'COZINHA', at: [11, 1] },
  { name: 'OFICINA', at: [19, 1] },
  { name: 'SALA', at: [1, 9] },
  { name: 'QUINTAL', at: [19, 9] },
  { name: 'LATRINA', at: [1, 15] },
  { name: 'DEPÓSITO', at: [7, 15] },
];

const BED_SLOTS: P[] = [[2, 3], [5, 3], [8, 3], [2, 6], [5, 6], [8, 6]];
const STATIONS = {
  workbench: [22, 3] as P,
  stove: [14, 3] as P,
  filter: [25, 6] as P,
  latrine: [3, 17] as P,
  collectors: [[21, 10], [25, 10]] as P[],
  gardens: [[20, 15], [24, 15]] as P[],
};

const SPOTS: Record<string, P[]> = {
  rest: [[3, 11], [6, 12], [9, 11], [12, 12], [15, 11], [4, 12]],
  craft: [[21, 4], [23, 4], [20, 3], [24, 4]],
  garden: [[21, 14], [25, 14], [22, 17], [26, 17]],
  clean: [[4, 16], [9, 16], [13, 17], [16, 16]],
  guard: [[11, 17], [13, 17], [12, 16], [10, 16]],
  floorSleep: [[3, 4], [6, 4], [8, 5], [3, 7], [7, 7], [9, 4]],
};

const BODY = [0xc9a24a, 0x6a9a3a, 0x4f86b8, 0xa65b86, 0xc7782c, 0x7aa86a, 0x8b7bc0, 0xd08a4a];
const SKIN = [0xf1c9a5, 0xc68e62, 0x8d5a3b, 0xe0ac85];
const HAIR = [0x2b1d14, 0x5a3a20, 0x1a1a1a, 0x8a6a3a];

const isWall = (() => {
  const grid: boolean[] = new Array(W * H).fill(false);
  for (let x = 0; x < W; x++) {
    grid[x] = true;
    if (x !== FRONT_DOOR[0]) grid[(H - 1) * W + x] = true;
  }
  for (let y = 0; y < H; y++) {
    grid[y * W] = true;
    grid[y * W + W - 1] = true;
  }
  for (const [[x0, y0], [x1, y1]] of WALLS) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!GAPS.some(([gx, gy]) => gx === x && gy === y)) grid[y * W + x] = true;
  }
  return (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x];
})();

const isYard = (x: number, y: number) => x >= 19 && y >= 9 && y <= 18;

interface Sprite {
  body: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Text;
  target: P | null;
}

export class ShelterScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private floor!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Graphics[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private sprites = new Map<string, Sprite>();
  private decor: Phaser.GameObjects.GameObject[] = [];
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('shelter');
    this.onReady = onReady;
  }

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.sprites.clear();
    this.decor = [];
    setupObliqueCamera(this);
    this.floor = this.add.graphics().setDepth(0);
    this.rows = Array.from({ length: H }, (_, y) => this.add.graphics().setDepth(rowDepth(y, 5)));
    for (const r of ROOMS) {
      this.add.text(r.at[0] * TILE + 4, r.at[1] * TILE + 3, r.name, { fontFamily: 'monospace', fontSize: '10px', color: '#c9bba3' }).setAlpha(0.55).setDepth(1);
    }
    this.night = this.add.rectangle(0, -WALL_H, W * TILE, H * TILE + WALL_H, 0x0b1630, 0).setOrigin(0).setDepth(100000);
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.fidget() });
    this.onReady();
  }

  update(): void {
    // Quem está mais embaixo na tela fica na frente.
    for (const sp of this.sprites.values()) sp.body.setDepth(rowDepth(Math.floor((sp.body.y + 5) / TILE), 7));
  }

  draw(s: ShelterState): void {
    this.drawHouse(s);
    this.drawPeople(s);
    const h = hourOfDay(s.hour);
    this.night.setFillStyle(0x0b1630, isNight(h) ? 0.5 : h === 20 || h === 6 ? 0.25 : 0);
  }

  private icon(x: number, y: number, text: string, row: number, alpha = 1): void {
    this.decor.push(this.add.text(x, y, text, { fontSize: '15px' }).setOrigin(0.5).setAlpha(alpha).setDepth(rowDepth(row, 6)));
  }

  private drawHouse(s: ShelterState): void {
    const f = this.floor;
    f.clear();
    for (const g of this.rows) g.clear();
    for (const o of this.decor) o.destroy();
    this.decor = [];

    f.fillStyle(0x0a0908).fillRect(0, -WALL_H, W * TILE, H * TILE + WALL_H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isWall(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (isYard(x, y)) {
          f.fillStyle((x * 7 + y * 3) % 5 ? 0x3b4a24 : 0x37451f).fillRect(px, py, TILE, TILE);
          f.fillStyle(0x4c5e2e).fillRect(px + ((x * 13) % 20), py + ((y * 7) % 18) + 4, 2, 4);
        } else {
          // Tábuas de madeira
          f.fillStyle(y % 2 ? 0x4a3b2c : 0x46382a).fillRect(px, py, TILE, TILE);
          f.lineStyle(1, 0x3a2e22, 0.8).lineBetween(px, py + TILE / 2, px + TILE, py + TILE / 2);
          f.lineBetween(px + ((x + y) % 2 ? 8 : 20), py, px + ((x + y) % 2 ? 8 : 20), py + TILE / 2);
        }
      }
    }

    // Paredes, linha por linha
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isWall(x, y)) wall(this.rows[y], x, y, !isWall(x, y + 1));
      }
    }

    // Porta da frente (na parede de baixo) e barricadas na frente dela
    const [dx, dy] = FRONT_DOOR;
    const door = this.rows[dy];
    door.fillStyle(0x6b4423).fillRect(dx * TILE + 3, dy * TILE + TILE - WALL_H - 10, TILE - 6, WALL_H + 10);
    door.fillStyle(0xd9b45b).fillCircle(dx * TILE + TILE - 8, dy * TILE + TILE - 10, 1.5);
    for (let i = 0; i < s.buildings.barricade; i++) {
      box(this.rows[dy - 1], (dx - 1) * TILE + 2 + i * 3, (dy - 1) * TILE + 10 + i * 4, TILE * 3 - 4 - i * 6, 8, 6 + i * 3, 0x7a6040);
    }

    BED_SLOTS.forEach(([x, y], i) => {
      if (i >= s.buildings.bed) return;
      const g = this.rows[y];
      box(g, x * TILE + 3, y * TILE - 6, TILE - 6, TILE + 2, 7, 0x8a5a3a);
      g.fillStyle(0x7a8fb0).fillRect(x * TILE + 4, y * TILE - 6, TILE - 8, TILE - 6);
      g.fillStyle(0xe8e0d0).fillRect(x * TILE + 6, y * TILE - 11, TILE - 12, 6);
    });

    const station = (p: P, emoji: string, built: boolean, color: number, h = 12) => {
      const px = p[0] * TILE;
      const py = p[1] * TILE;
      if (built) {
        box(this.rows[p[1]], px + 3, py + 6, TILE - 6, TILE - 10, h, color);
        this.icon(px + TILE / 2, py + 6 - h + (TILE - 10) / 2, emoji, p[1]);
      } else {
        f.lineStyle(1, 0xa89a80, 0.35).strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
        this.icon(px + TILE / 2, py + TILE / 2, emoji, 0, 0.25);
      }
    };
    station(STATIONS.workbench, RECIPES.workbench.icon, s.buildings.workbench > 0, 0x8a6a3e);
    station(STATIONS.stove, RECIPES.stove.icon, s.buildings.stove > 0, 0x6a6a6a, 14);
    station(STATIONS.filter, RECIPES.filter.icon, s.buildings.filter > 0, 0x4f7394, 18);
    station(STATIONS.latrine, RECIPES.latrine.icon, s.buildings.latrine > 0, 0x9a978a, 10);
    STATIONS.collectors.forEach((p, i) => station(p, RECIPES.rainCollector.icon, i < s.buildings.rainCollector, 0x3d6f8f, 16));

    STATIONS.gardens.forEach((p, i) => {
      const px = p[0] * TILE;
      const py = p[1] * TILE;
      if (i < s.buildings.garden) {
        const g = this.rows[p[1] + 1];
        box(g, px + 2, py + 2, TILE * 3 - 4, TILE * 2 - 4, 4, 0x5a4026);
        for (let k = 0; k < 6; k++) {
          const cx = px + 14 + (k % 3) * 28;
          const cy = py + 12 + Math.floor(k / 3) * 24;
          g.fillStyle(s.gardenWatered ? 0x5f9e3a : 0x8a8f4a).fillTriangle(cx - 6, cy, cx, cy - 12, cx + 6, cy);
          g.fillStyle(s.gardenWatered ? 0x7cc04f : 0x9aa055).fillCircle(cx, cy - 8, 4);
        }
      } else {
        f.lineStyle(1, 0xa89a80, 0.35).strokeRect(px + 3, py + 3, TILE * 3 - 6, TILE * 2 - 6);
        this.icon(px + TILE * 1.5, py + TILE, RECIPES.garden.icon, 0, 0.25);
      }
    });

    // Depósito: caixotes que crescem com o estoque.
    const piles: [number, number][] = [
      [s.resources.food, 0xa0623a],
      [s.resources.water, 0x3d85c6],
      [s.resources.wood + s.resources.scrap, 0x8a7a5a],
    ];
    piles.forEach(([amount, color], i) => {
      const n = Math.min(6, Math.ceil(amount / 3));
      for (let k = 0; k < n; k++) {
        const bx = (8 + i * 3) * TILE + (k % 3) * 10 + 2;
        const by = 17 * TILE + 10 - Math.floor(k / 3) * 7;
        box(this.rows[17], bx, by, 9, 8, 7 + Math.floor(k / 3) * 6, color);
      }
    });

    if (s.resources.waste > 6) {
      const n = Math.min(10, Math.floor(s.resources.waste / 2));
      for (let k = 0; k < n; k++) {
        f.fillStyle(0x3d3a26, 0.85).fillEllipse((2 + ((k * 7) % 4)) * TILE + 10, (15 + (k % 3)) * TILE + 14, 12 + (k % 3) * 3, 7);
      }
    }
  }

  private drawPeople(s: ShelterState): void {
    const home = s.survivors.filter((v) => v.status === 'home');
    for (const [id, sp] of this.sprites) {
      if (!home.some((v) => v.id === id)) {
        sp.body.destroy();
        this.sprites.delete(id);
      }
    }
    const night = isNight(hourOfDay(s.hour));
    const used: Record<string, number> = {};
    let bedIndex = 0;
    home.forEach((v) => {
      let spot: P;
      if (night && v.task !== 'guard') {
        spot = bedIndex < s.buildings.bed ? BED_SLOTS[bedIndex] : SPOTS.floorSleep[(bedIndex - s.buildings.bed) % SPOTS.floorSleep.length];
        bedIndex++;
      } else {
        const list = SPOTS[v.task];
        const k = (used[v.task] = (used[v.task] ?? -1) + 1);
        spot = list[k % list.length];
      }
      const sp = this.sprites.get(v.id) ?? this.makeSprite(v, s.survivors.indexOf(v));
      sp.icon.setText(statusIcon(v, night));
      if (!sp.target || sp.target[0] !== spot[0] || sp.target[1] !== spot[1]) {
        sp.target = spot;
        const to = feet(spot[0], spot[1]);
        this.tweens.killTweensOf(sp.body);
        this.tweens.add({ targets: sp.body, x: to.x, y: to.y, duration: 1200, ease: 'Sine.easeInOut' });
      }
    });
  }

  private makeSprite(v: ShelterSurvivor, i: number): Sprite {
    const start = feet(FRONT_DOOR[0], FRONT_DOOR[1] - 1);
    const body = figure(this, { body: BODY[i % BODY.length], skin: SKIN[i % SKIN.length], hair: HAIR[(i * 3) % HAIR.length] });
    const name = this.add
      .text(0, 3, v.name, { fontFamily: 'monospace', fontSize: '9px', color: '#f1ebe0', backgroundColor: '#00000066', padding: { x: 2, y: 0 } })
      .setOrigin(0.5, 0);
    const icon = this.add.text(0, -34, '', { fontSize: '13px' }).setOrigin(0.5, 1);
    body.add([name, icon]);
    body.setPosition(start.x, start.y);
    const sp: Sprite = { body, icon, target: null };
    this.sprites.set(v.id, sp);
    return sp;
  }

  private fidget(): void {
    for (const sp of this.sprites.values()) {
      if (!sp.target || Math.random() > 0.35 || this.tweens.isTweening(sp.body)) continue;
      const base = feet(sp.target[0], sp.target[1]);
      this.tweens.add({
        targets: sp.body,
        x: base.x + Phaser.Math.Between(-6, 6),
        y: base.y + Phaser.Math.Between(-3, 3),
        duration: 600,
        ease: 'Sine.easeInOut',
      });
    }
  }
}

/** O balão mais urgente acima da cabeça. */
function statusIcon(v: ShelterSurvivor, night: boolean): string {
  if (v.health < 30) return '🩸';
  if (v.sick) return '🤒';
  const emo = emotionOf(v.mood);
  if (emo === 'quebrado') return '💢';
  if (v.thirst >= 75) return '💧';
  if (v.hunger >= 75) return '🍽️';
  if (emo === 'deprimido') return '😞';
  if (night && v.task !== 'guard') return '💤';
  if (emo === 'triste') return '😟';
  if (v.task === 'guard') return '👁️';
  return '';
}


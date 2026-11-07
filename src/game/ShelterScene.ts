import Phaser from 'phaser';
import { RECIPES } from '../data/shelter';
import { emotionOf, hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState, ShelterSurvivor } from '../sim/shelter/types';
import { TILE } from './RaidScene';

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
  craft: [[21, 4], [23, 4], [20, 3], [24, 3]],
  garden: [[21, 14], [25, 14], [22, 17], [26, 17]],
  clean: [[4, 16], [9, 16], [13, 17], [16, 16]],
  guard: [[11, 17], [13, 17], [12, 16], [10, 16]],
  floorSleep: [[3, 4], [6, 4], [8, 6], [3, 7], [7, 7], [9, 4]],
};

const COLORS = [0xd9b45b, 0x8fbf5a, 0x6fa8dc, 0xc27ba0, 0xe69138, 0x93c47d, 0xb4a7d6, 0xf6b26b];

interface Sprite {
  body: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Text;
  target: P | null;
}

export class ShelterScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Rectangle;
  private sprites = new Map<string, Sprite>();
  private stationIcons: Phaser.GameObjects.Text[] = [];
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('shelter');
    this.onReady = onReady;
  }

  create(): void {
    this.sprites.clear();
    this.stationIcons = [];
    this.gfx = this.add.graphics();
    for (const r of ROOMS) {
      this.add.text(r.at[0] * TILE + 4, r.at[1] * TILE + 2, r.name, { fontFamily: 'monospace', fontSize: '10px', color: '#8a8275' }).setAlpha(0.7);
    }
    this.night = this.add.rectangle(0, 0, W * TILE, H * TILE, 0x0b1630, 0).setOrigin(0).setDepth(50);
    // Pequenos passeios aleatórios: as pessoas não ficam paradas como estátuas.
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.fidget() });
    this.onReady();
  }

  draw(s: ShelterState): void {
    this.drawHouse(s);
    this.drawPeople(s);
    const h = hourOfDay(s.hour);
    this.night.setFillStyle(0x0b1630, isNight(h) ? 0.5 : h === 20 || h === 6 ? 0.25 : 0);
  }

  private drawHouse(s: ShelterState): void {
    const g = this.gfx;
    g.clear();
    for (const t of this.stationIcons) t.destroy();
    this.stationIcons = [];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const yard = x >= 19 && y >= 9 && y <= 18;
        g.fillStyle(yard ? ((x + y) % 2 ? 0x2a3320 : 0x27301e) : (x + y) % 2 ? 0x332e27 : 0x2f2a24).fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    const wall = (x: number, y: number) => {
      g.fillStyle(0x5a544b).fillRect(x * TILE, y * TILE, TILE, TILE);
      g.fillStyle(0x6d665b).fillRect(x * TILE, y * TILE, TILE, 6);
    };
    for (let x = 0; x < W; x++) {
      wall(x, 0);
      if (x !== FRONT_DOOR[0]) wall(x, H - 1);
    }
    for (let y = 0; y < H; y++) {
      wall(0, y);
      wall(W - 1, y);
    }
    for (const [[x0, y0], [x1, y1]] of WALLS) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!GAPS.some(([gx, gy]) => gx === x && gy === y)) wall(x, y);
    }
    // Porta da frente + barricada
    g.fillStyle(0x8b5a2b).fillRect(FRONT_DOOR[0] * TILE + 2, FRONT_DOOR[1] * TILE + 4, TILE - 4, TILE - 8);
    for (let i = 0; i < s.buildings.barricade; i++) {
      g.fillStyle(0x7a6040).fillRect((FRONT_DOOR[0] - 1) * TILE, (FRONT_DOOR[1] - 1) * TILE + 6 + i * 7, TILE * 3, 5);
    }

    BED_SLOTS.forEach(([x, y], i) => {
      if (i < s.buildings.bed) {
        g.fillStyle(0x6b4f2a).fillRect(x * TILE + 3, y * TILE - 6, TILE - 6, TILE + 10);
        g.fillStyle(0xcfc6b6).fillRect(x * TILE + 5, y * TILE - 4, TILE - 10, 8);
      }
    });

    const station = (p: P, icon: string, built: boolean, size = 1) => {
      if (built) {
        g.fillStyle(0x4a3a26).fillRect(p[0] * TILE + 2, p[1] * TILE + 2, TILE * size - 4, TILE - 4);
      } else {
        g.lineStyle(1, 0x6a6255, 0.6).strokeRect(p[0] * TILE + 3, p[1] * TILE + 3, TILE * size - 6, TILE - 6);
      }
      const t = this.add.text(p[0] * TILE + (TILE * size) / 2, p[1] * TILE + TILE / 2, icon, { fontSize: '16px' }).setOrigin(0.5).setAlpha(built ? 1 : 0.25);
      this.stationIcons.push(t);
    };
    station(STATIONS.workbench, RECIPES.workbench.icon, s.buildings.workbench > 0);
    station(STATIONS.stove, RECIPES.stove.icon, s.buildings.stove > 0);
    station(STATIONS.filter, RECIPES.filter.icon, s.buildings.filter > 0);
    station(STATIONS.latrine, RECIPES.latrine.icon, s.buildings.latrine > 0);
    STATIONS.collectors.forEach((p, i) => station(p, RECIPES.rainCollector.icon, i < s.buildings.rainCollector));
    STATIONS.gardens.forEach((p, i) => {
      if (i < s.buildings.garden) {
        g.fillStyle(0x4b3a22).fillRect(p[0] * TILE + 2, p[1] * TILE + 2, TILE * 3 - 4, TILE * 2 - 4);
        g.fillStyle(s.gardenWatered ? 0x6aa84f : 0x8a8f4a);
        for (let k = 0; k < 6; k++) g.fillCircle(p[0] * TILE + 12 + (k % 3) * 28, p[1] * TILE + 14 + Math.floor(k / 3) * 26, 5);
      } else {
        g.lineStyle(1, 0x6a6255, 0.6).strokeRect(p[0] * TILE + 3, p[1] * TILE + 3, TILE * 3 - 6, TILE * 2 - 6);
        this.stationIcons.push(this.add.text(p[0] * TILE + TILE * 1.5, p[1] * TILE + TILE, RECIPES.garden.icon, { fontSize: '16px' }).setOrigin(0.5).setAlpha(0.25));
      }
    });

    // Depósito: pilhas que crescem com o estoque.
    const piles: [number, number][] = [
      [s.resources.food, 0xa0522d],
      [s.resources.water, 0x3d85c6],
      [s.resources.wood + s.resources.scrap, 0x7f6a4f],
    ];
    piles.forEach(([amount, color], i) => {
      const n = Math.min(6, Math.ceil(amount / 3));
      for (let k = 0; k < n; k++) {
        g.fillStyle(color).fillRect((8 + i * 3) * TILE + (k % 3) * 9 + 2, 17 * TILE - Math.floor(k / 3) * 9 + 8, 8, 8);
      }
    });

    if (s.resources.waste > 6) {
      g.fillStyle(0x4a4a2a, 0.7);
      const n = Math.min(10, Math.floor(s.resources.waste / 2));
      for (let k = 0; k < n; k++) g.fillCircle((2 + (k * 7) % 4) * TILE + 10, (15 + (k % 3)) * TILE + 12, 4 + (k % 3));
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
        this.tweens.killTweensOf(sp.body);
        this.tweens.add({
          targets: sp.body,
          x: spot[0] * TILE + TILE / 2,
          y: spot[1] * TILE + TILE / 2,
          duration: 1200,
          ease: 'Sine.easeInOut',
        });
      }
    });
  }

  private makeSprite(v: ShelterSurvivor, i: number): Sprite {
    const color = COLORS[i % COLORS.length];
    const start = [FRONT_DOOR[0] * TILE + TILE / 2, (FRONT_DOOR[1] - 1) * TILE + TILE / 2];
    const circle = this.add.circle(0, 0, TILE / 2 - 4, color).setStrokeStyle(2, 0x1a1712);
    const letter = this.add.text(0, 0, v.name[0], { fontFamily: 'monospace', fontSize: '13px', color: '#1a1712', fontStyle: 'bold' }).setOrigin(0.5);
    const name = this.add.text(0, TILE / 2 + 2, v.name, { fontFamily: 'monospace', fontSize: '9px', color: '#e7e2d9' }).setOrigin(0.5, 0);
    const icon = this.add.text(0, -TILE / 2 - 2, '', { fontSize: '13px' }).setOrigin(0.5, 1);
    const body = this.add.container(start[0], start[1], [circle, letter, name, icon]).setDepth(10);
    const sp: Sprite = { body, icon, target: null };
    this.sprites.set(v.id, sp);
    return sp;
  }

  private fidget(): void {
    for (const sp of this.sprites.values()) {
      if (!sp.target || Math.random() > 0.35 || this.tweens.isTweening(sp.body)) continue;
      this.tweens.add({
        targets: sp.body,
        x: sp.target[0] * TILE + TILE / 2 + Phaser.Math.Between(-6, 6),
        y: sp.target[1] * TILE + TILE / 2 + Phaser.Math.Between(-4, 4),
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

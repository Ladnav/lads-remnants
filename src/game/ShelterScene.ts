import Phaser from 'phaser';
import { emotionOf, hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState, ShelterSurvivor } from '../sim/shelter/types';
import { TILE, WALL_H, feet, rowDepth, setupObliqueCamera, smoothPainted } from './oblique';
import { footShadow, paintHouse, type FloorKind } from './pixelHouse';
import { ensureIcon, iconFor } from './icons';
import { NightLight, makeRain, type LightSource, type OpenArea } from './night';
import { Actor, preloadBodies, survivorLook, type Pose } from './sprites';

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
  // Fundos da oficina, com uma passagem larga para o quintal.
  [[19, 8], [26, 8]],
];
const GAPS: P[] = [[10, 4], [18, 4], [18, 11], [5, 8], [14, 8], [3, 14], [12, 14], [6, 17], [22, 8], [23, 8]];
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

/**
 * Camas encostadas na parede de cima do dormitório e na de baixo, com um corredor no meio e a porta
 * da sala livre. `slot` é o tile de quem dorme nela; `cx`/`top` são da imagem (pixel/house/bed.png, 47×73).
 */
const BEDS: { slot: P; cx: number; top: number }[] = [
  { slot: [2, 3], cx: 70, top: 22 },
  { slot: [5, 3], cx: 154, top: 22 },
  { slot: [8, 3], cx: 238, top: 22 },
  { slot: [2, 7], cx: 56, top: 135 },
  { slot: [7, 7], cx: 196, top: 135 },
  { slot: [9, 7], cx: 252, top: 135 },
];
const BED_SLOTS: P[] = BEDS.map((b) => b.slot);
const BED_H = 73;
/** Quem dorme fica com os pés aqui: a cabeça cai no travesseiro. */
const SLEEP_DY = 66;

/** Tiles de referência de cada construção (luz, e onde fica o risco de giz quando não existe). */
const STATIONS = {
  workbench: [22, 2] as P,
  stove: [12, 2] as P,
  filter: [25, 2] as P,
  latrine: [1, 16] as P,
  radio: [16, 10] as P,
  collectors: [[21, 10], [25, 10]] as P[],
  gardens: [[20, 15], [24, 15]] as P[],
};

/** Um móvel em pixel art: imagem pixel/house/<key>.png com a base em (cx, bottom) e os tiles que ocupa. */
interface Furn {
  key: string;
  cx: number;
  bottom: number;
  block: P[];
  /** Fração da altura da imagem que é tampo (profundidade da sombra no chão). */
  depth?: number;
}

/** Construções, encostadas nas paredes como numa casa de verdade. */
const BUILT: Record<'stove' | 'workbench' | 'filter' | 'radio' | 'latrine', Furn> = {
  stove: { key: 'stove', cx: 350, bottom: 92, block: [[12, 1], [12, 2]] },
  workbench: { key: 'workbench', cx: 630, bottom: 78, block: [[21, 1], [22, 1], [23, 1], [21, 2], [22, 2], [23, 2]] },
  filter: { key: 'filter', cx: 714, bottom: 80, block: [[25, 1], [25, 2]], depth: 0.3 },
  radio: { key: 'radio', cx: 462, bottom: 312, block: [[16, 9], [16, 10]], depth: 0.3 },
  latrine: { key: 'latrine', cx: 46, bottom: 468, block: [[1, 15], [1, 16]] },
};
/** Coletor de chuva: barril azul sobre blocos, na borda do quintal. */
const COLLECTORS: Furn[] = STATIONS.collectors.map(([x, y]) => ({ key: 'barrel', cx: x * TILE + 14, bottom: 300, block: [[x, y - 1], [x, y]], depth: 0.3 }));

/** Móveis que sempre estiveram na casa. */
const DECOR: Furn[] = [
  { key: 'shelf', cx: 434, bottom: 70, block: [[15, 1], [15, 2]] },
  { key: 'chair', cx: 404, bottom: 136, block: [] },
  { key: 'table', cx: 406, bottom: 168, block: [[14, 5]], depth: 0.5 },
  { key: 'shelf', cx: 280, bottom: 298, block: [[9, 9], [10, 9]] },
  { key: 'chair', cx: 222, bottom: 304, block: [] },
  { key: 'table', cx: 224, bottom: 340, block: [[7, 11], [8, 11]], depth: 0.5 },
  { key: 'scrap', cx: 574, bottom: 206, block: [[20, 7]], depth: 0.6 },
  { key: 'lantern', cx: 128, bottom: 134, block: [], depth: 0.25 },
  { key: 'bucket', cx: 84, bottom: 446, block: [], depth: 0.4 },
];

/**
 * Trilhas pisadas no quintal (pixels do mundo): da porta da sala até os coletores e, entre as duas
 * hortas, até o fundo.
 */
const YARD_PATHS: [number, number][][] = [
  [[530, 322], [572, 326], [612, 338], [652, 372], [658, 420], [658, 500]],
  [[612, 338], [668, 330], [714, 316]],
  [[612, 338], [602, 318]],
  [[612, 338], [640, 300], [644, 250]],
];

const HOUSE_PROPS = ['bed', 'stove', 'workbench', 'filter', 'radio', 'latrine', 'garden', 'barricade', 'crates', 'sacks', 'barrel', 'shelf', 'table', 'chair', 'scrap', 'lantern', 'bucket'];

const SPOTS: Record<string, P[]> = {
  rest: [[3, 11], [6, 12], [9, 11], [12, 12], [15, 11], [4, 12]],
  craft: [[21, 4], [23, 4], [20, 3], [24, 4]],
  garden: [[21, 14], [25, 14], [22, 17], [26, 17]],
  clean: [[4, 16], [9, 16], [13, 17], [16, 16]],
  guard: [[11, 17], [13, 17], [12, 16], [10, 16]],
  floorSleep: [[3, 4], [5, 5], [7, 4], [9, 4], [4, 5], [6, 4]],
};

const DIRS: P[] = [[0, 1], [1, 0], [-1, 0], [0, -1]];
/** Milissegundos para atravessar um tile andando. */
const STEP_MS = 190;

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

/** A borda de fora do quintal é cerca de madeira, não parede da casa. */
const isFence = (x: number, y: number): boolean => (x === W - 1 && y >= 9) || (y === H - 1 && x >= 19);

const isYard = (x: number, y: number) => x >= 19 && y >= 9 && y <= 18;

/** Piso de cada cômodo: quintal de mato com trilha, cozinha e latrina de azulejo, oficina e depósito de cimento. */
const floorOf = (x: number, y: number): FloorKind => {
  if (isYard(x, y)) return 'grass';
  if (x >= 19) return 'concrete';
  if (x >= 11 && x <= 17 && y <= 7) return 'tile';
  if (y >= 15 && x <= 5) return 'tile';
  if (y >= 15 && x >= 7 && x <= 17) return 'concrete';
  return 'wood';
};

interface Sprite {
  actor: Actor;
  body: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  target: P | null;
  /** Tiles que ainda faltam percorrer. */
  path: P[];
  /** Como fica ao chegar: em pé, na cama ou no chão. */
  pose: Pose;
  /** Posição exata ao chegar (na cama), em vez dos pés no meio do tile. */
  restAt: { x: number; y: number } | null;
  /** Está indo embora pela porta; some ao chegar nela. */
  leaving: boolean;
}

export class ShelterScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private floor!: Phaser.GameObjects.Graphics;
  private night!: NightLight;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sprites = new Map<string, Sprite>();
  private decor: Phaser.GameObjects.GameObject[] = [];
  /** Tiles ocupados por móveis: ninguém atravessa, só chega neles. */
  private blocked = new Set<number>();
  /** Falso até o primeiro desenho: quem já estava em casa aparece no lugar, sem andar da porta. */
  private populated = false;
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('shelter');
    this.onReady = onReady;
  }

  preload(): void {
    preloadBodies(this);
    for (const k of HOUSE_PROPS) if (!this.textures.exists(`house-${k}`)) this.load.image(`house-${k}`, `pixel/house/${k}.png`);
  }

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.sprites.clear();
    this.populated = false;
    this.decor = [];
    // Se a casa não couber inteira (celular), começa olhando para a sala, perto da porta.
    setupObliqueCamera(this, W * TILE, H * TILE, { x: 10 * TILE, y: 12 * TILE });
    smoothPainted(this);
    this.buildHouse();
    this.floor = this.add.graphics().setDepth(1);
    for (const r of ROOMS) {
      this.add.text(r.at[0] * TILE + 4, r.at[1] * TILE + 6, r.name, { fontFamily: 'monospace', fontSize: '9px', color: '#e8dfcc' }).setAlpha(0.45).setDepth(1);
    }
    this.night = new NightLight(this, W * TILE, H * TILE + WALL_H, { tile: TILE, cols: W, rows: H, opaque: isWall });
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.fidget() });
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.night.flicker() });
    // Chuva no quintal, a única parte da casa sem telhado.
    this.rain = makeRain(this, 19 * TILE, 9 * TILE, 27 * TILE, 18 * TILE);
    // Poeira flutuando dentro de casa: quase invisível, mas tira a sensação de quadro parado.
    if (!this.textures.exists('mote')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xf3dcb0).fillCircle(2, 2, 2);
      g.generateTexture('mote', 4, 4);
      g.destroy();
    }
    this.add
      .particles(0, 0, 'mote', {
        x: { min: TILE, max: 18 * TILE },
        y: { min: TILE, max: 18 * TILE },
        lifespan: 7000,
        speedX: { min: -3, max: 3 },
        speedY: { min: -4, max: 1 },
        scale: { min: 0.15, max: 0.4 },
        alpha: { values: [0, 0.35, 0] },
        frequency: 260,
      })
      .setDepth(90000);
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
    // De dia a casa é mais escura que o quintal, que não tem telhado; à noite o quintal tem só a lua.
    const dusk = h === 20 || h === 6;
    const yard: OpenArea = { x: 19 * TILE, y: 9 * TILE, w: 8 * TILE, h: 10 * TILE, amount: isNight(h) ? 0.3 : dusk ? 0.5 : 0.72 };
    const day = !isNight(h) && !dusk;
    // De dia a casa fica só na penumbra, sem focos (em degraus, um foco de dia vira uma mancha clara).
    this.night.set(isNight(h) ? 0.72 : dusk ? 0.5 : 0.32, day ? [] : this.lightSources(s), [yard]);
    if (this.rain.emitting !== s.raining) s.raining ? this.rain.start() : this.rain.stop();
  }

  /**
   * Casa em pixel art (pixelHouse.ts): o chão vai inteiro para o fundo; as paredes são recortes da
   * mesma textura, uma faixa por linha, para as pessoas continuarem passando atrás delas.
   */
  private buildHouse(): void {
    paintHouse(this, 'house', { cols: W, rows: H, isWall, floorOf, door: FRONT_DOOR, paths: YARD_PATHS, fence: isFence });
    this.add.image(0, -WALL_H, 'house-floor').setOrigin(0).setDepth(0);
    const solid = (x: number, y: number) => isWall(x, y) || (x === FRONT_DOOR[0] && y === FRONT_DOOR[1]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!solid(x, y)) continue;
        // Junta os tiles vizinhos da linha que têm (ou não têm) face num recorte só.
        const front = !isWall(x, y + 1);
        let end = x;
        while (solid(end + 1, y) && !isWall(end + 1, y + 1) === front) end++;
        const h = TILE + (front ? WALL_H : 0);
        this.add.image(0, -WALL_H, 'house-walls').setOrigin(0).setCrop(x * TILE, y * TILE, (end - x + 1) * TILE, h).setDepth(rowDepth(y, 5));
        x = end;
      }
    }
  }

  /** Móvel em pixel art com a base em (cx, bottom) e a sombra da área que ele ocupa no chão. */
  private prop(key: string, cx: number, bottom: number, depthFrac = 0.34, layer = 6): Phaser.GameObjects.Image {
    const tex = `house-${key}`;
    const img = this.add.image(Math.round(cx), Math.round(bottom), tex).setOrigin(0.5, 1);
    img.setDepth(rowDepth(Math.floor((bottom - 1) / TILE), layer));
    const shadow = this.add.image(Math.round(cx - img.width / 2) - 1, Math.round(bottom) - img.height, footShadow(this, tex, depthFrac)).setOrigin(0).setDepth(2);
    this.decor.push(img, shadow);
    return img;
  }

  private furn(f: Furn): Phaser.GameObjects.Image {
    return this.prop(f.key, f.cx, f.bottom, f.depth);
  }

  private drawHouse(s: ShelterState): void {
    const f = this.floor;
    f.clear();
    for (const o of this.decor) o.destroy();
    this.decor = [];
    // Lugar reservado para o que ainda não foi construído: um risco de giz tracejado no chão.
    const mark = (tiles: P[]) => {
      const xs = tiles.map((t) => t[0]);
      const ys = tiles.map((t) => t[1]);
      const x0 = Math.min(...xs) * TILE + 3;
      const y0 = Math.min(...ys) * TILE + 3;
      const w = (Math.max(...xs) + 1) * TILE - 3 - x0;
      const h = (Math.max(...ys) + 1) * TILE - 3 - y0;
      f.fillStyle(0xd6cfc1, 0.35);
      for (let x = x0; x < x0 + w; x += 4) f.fillRect(x, y0, 2, 1).fillRect(x, y0 + h - 1, 2, 1);
      for (let y = y0; y < y0 + h; y += 4) f.fillRect(x0, y, 1, 2).fillRect(x0 + w - 1, y, 1, 2);
    };

    for (const d of DECOR) this.furn(d);
    BEDS.forEach((b, i) => {
      if (i < s.buildings.bed) this.prop('bed', b.cx, b.top + BED_H, 0.75);
    });
    const station = (furn: Furn, built: boolean) => (built ? this.furn(furn) : mark(furn.block));
    station(BUILT.stove, s.buildings.stove > 0);
    station(BUILT.workbench, s.buildings.workbench > 0);
    station(BUILT.filter, s.buildings.filter > 0);
    station(BUILT.radio, s.buildings.radio > 0);
    station(BUILT.latrine, s.buildings.latrine > 0);
    COLLECTORS.forEach((c, i) => station(c, i < s.buildings.rainCollector));
    STATIONS.gardens.forEach(([x, y], i) => {
      if (i < s.buildings.garden) {
        const bed = this.prop('garden', x * TILE + TILE * 1.5, (y + 2) * TILE, 0.55);
        // Horta de sobrevivência: verde cansado; sem água fica amarelada.
        bed.setTint(s.gardenWatered ? 0x9c9a7e : 0x948260);
      } else {
        mark([[x, y], [x + 2, y + 1]]);
      }
    });

    // Barricada na frente da porta: cada nível põe mais tábuas.
    const [dx, dy] = FRONT_DOOR;
    for (let i = 0; i < s.buildings.barricade; i++) {
      this.prop('barricade', dx * TILE + TILE / 2 + (i === 0 ? 0 : i % 2 ? 5 : -5), dy * TILE - 2 - i * 5, 0.3, 6 + i * 0.1);
    }

    // Depósito: comida em sacos, água em barris e material em caixotes, crescendo com o estoque.
    const pile = (amount: number) => (amount < 1 ? 0 : Math.min(3, Math.ceil(amount / 5)));
    for (let k = 0; k < pile(s.resources.food); k++) this.prop('sacks', 214 + k * 30, 452 + (k % 2) * 3, 0.5);
    for (let k = 0; k < pile(s.resources.water); k++) this.prop('barrel', 404 + k * 30, 462, 0.3);
    for (let k = 0; k < pile(s.resources.wood + s.resources.scrap); k++) this.prop('crates', 216 + k * 34, 514, 0.4).setFlipX(k === 1);

    if (s.resources.waste > 6) {
      // Sujeira acumulada perto da latrina: manchas de pixel, sem borda lisa.
      const n = Math.min(10, Math.floor(s.resources.waste / 2));
      for (let k = 0; k < n; k++) {
        const x = (2 + ((k * 7) % 4)) * TILE + 6;
        const y = (15 + (k % 3)) * TILE + 12;
        f.fillStyle(0x2f2a1c, 0.75).fillRect(x, y, 10 + (k % 3) * 3, 4).fillRect(x + 2, y - 1, 6, 6);
      }
    }
  }

  /** Onde há luz à noite: fogão aceso, rádio, bancada, e um lampião na sala e outro no dormitório. */
  private lightSources(s: ShelterState): LightSource[] {
    const at = (p: P, r: number, fire = false): LightSource => ({ x: p[0] * TILE + TILE / 2, y: p[1] * TILE + TILE / 2, r, fire });
    const out = [at([8, 11], 150), at([5, 5], 95)];
    // O fogão aceso ilumina a cozinha até de dia.
    if (s.buildings.stove) out.push(at(STATIONS.stove, 130, true));
    if (s.buildings.radio) out.push(at(STATIONS.radio, 80));
    if (s.buildings.workbench) out.push(at(STATIONS.workbench, 70));
    return out;
  }

  private drawPeople(s: ShelterState): void {
    this.blocked = furniture(s);
    const home = s.survivors.filter((v) => v.status === 'home');
    for (const [id, sp] of this.sprites) {
      const v = s.survivors.find((x) => x.id === id);
      if (v?.status === 'home' || sp.leaving) continue;
      if (v && (v.status === 'away' || v.status === 'raid' || v.status === 'gone')) {
        // Sai andando pela porta da frente.
        sp.leaving = true;
        sp.pose = 'stand';
        sp.icon.setVisible(false);
        this.goTo(sp, [FRONT_DOOR[0], FRONT_DOOR[1] - 1]);
      } else {
        this.remove(id);
      }
    }
    const night = isNight(hourOfDay(s.hour));
    const used: Record<string, number> = {};
    let bedIndex = 0;
    home.forEach((v) => {
      let spot: P;
      let pose: Pose = 'stand';
      let rest: { x: number; y: number } | null = null;
      if (night && v.task !== 'guard') {
        const inBed = bedIndex < s.buildings.bed;
        spot = inBed ? BED_SLOTS[bedIndex] : SPOTS.floorSleep[(bedIndex - s.buildings.bed) % SPOTS.floorSleep.length];
        if (inBed) rest = { x: BEDS[bedIndex].cx, y: BEDS[bedIndex].top + SLEEP_DY };
        pose = inBed ? 'bed' : 'floor';
        bedIndex++;
      } else {
        const list = SPOTS[v.task];
        const k = (used[v.task] = (used[v.task] ?? -1) + 1);
        spot = list[k % list.length];
      }
      const sp = this.sprites.get(v.id) ?? this.makeSprite(v, this.populated ? null : spot);
      const balloon = iconFor(statusIcon(v, night));
      if (balloon) sp.icon.setTexture(ensureIcon(this, balloon)).setDisplaySize(15, 15).setVisible(true);
      else sp.icon.setVisible(false);
      const moved = sp.leaving || !sp.target || sp.target[0] !== spot[0] || sp.target[1] !== spot[1];
      sp.leaving = false;
      sp.pose = pose;
      sp.restAt = rest;
      if (!this.populated && rest && !sp.path.length) sp.body.setPosition(rest.x, rest.y);
      if (moved) this.goTo(sp, spot);
      else if (!sp.path.length && !this.tweens.isTweening(sp.body)) sp.actor.setPose(pose);
    });
    this.populated = true;
  }

  private makeSprite(v: ShelterSurvivor, at: P | null): Sprite {
    const start = at ? feet(at[0], at[1]) : feet(FRONT_DOOR[0], FRONT_DOOR[1] - 1);
    const actor = new Actor(this, survivorLook(v.id));
    const body = actor.container;
    const name = this.add
      .text(0, 3, v.name, { fontFamily: 'monospace', fontSize: '9px', color: '#f1ebe0', backgroundColor: '#00000066', padding: { x: 2, y: 0 } })
      .setOrigin(0.5, 0);
    const icon = this.add.image(0, -40, ensureIcon(this, 'sleep')).setOrigin(0.5, 1).setDisplaySize(15, 15).setVisible(false);
    body.add([name, icon]);
    body.setPosition(start.x, start.y);
    if (!at) actor.face('up');
    const sp: Sprite = { actor, body, icon, target: at, path: [], pose: 'stand', restAt: null, leaving: false };
    this.sprites.set(v.id, sp);
    return sp;
  }

  private remove(id: string): void {
    const sp = this.sprites.get(id);
    if (!sp) return;
    this.tweens.killTweensOf(sp.body);
    sp.body.destroy();
    this.sprites.delete(id);
  }

  /** Tile onde o boneco está agora (pelos pés). */
  private tileOf(sp: Sprite): P {
    const x = Phaser.Math.Clamp(Math.floor(sp.body.x / TILE), 0, W - 1);
    const y = Phaser.Math.Clamp(Math.round((sp.body.y - (TILE - 6)) / TILE), 0, H - 1);
    return [x, y];
  }

  private goTo(sp: Sprite, spot: P): void {
    sp.target = spot;
    sp.path = this.route(this.tileOf(sp), spot);
    this.tweens.killTweensOf(sp.body);
    this.step(sp);
  }

  /** Anda um tile do caminho e chama a si mesmo até chegar. */
  private step(sp: Sprite): void {
    const next = sp.path.shift();
    if (!next) {
      sp.actor.setWalking(false);
      if (sp.leaving) {
        for (const [id, other] of this.sprites) if (other === sp) this.remove(id);
        return;
      }
      sp.actor.face('down');
      sp.actor.setPose(sp.pose);
      return;
    }
    const to = !sp.path.length && sp.restAt && !sp.leaving ? sp.restAt : feet(next[0], next[1]);
    const dist = Math.hypot(to.x - sp.body.x, to.y - sp.body.y);
    sp.actor.setPose('stand');
    sp.actor.faceDelta(to.x - sp.body.x, to.y - sp.body.y);
    sp.actor.setWalking(true);
    this.tweens.add({ targets: sp.body, x: to.x, y: to.y, duration: Math.max(40, (dist / TILE) * STEP_MS), onComplete: () => this.step(sp) });
  }

  /** Menor caminho pelo grid (busca em largura), passando pelos vãos das paredes. */
  private route(from: P, to: P): P[] {
    const start = from[1] * W + from[0];
    const goal = to[1] * W + to[0];
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let q = 0; q < queue.length && !prev.has(goal); q++) {
      const c = queue[q];
      for (const [dx, dy] of DIRS) {
        const nx = (c % W) + dx;
        const ny = Math.floor(c / W) + dy;
        const n = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(n) || isWall(nx, ny)) continue;
        if (n !== goal && this.blocked.has(n)) continue;
        prev.set(n, c);
        queue.push(n);
      }
    }
    // O último passo sempre acerta a posição exata, mesmo que já esteja no tile.
    if (!prev.has(goal) || start === goal) return [to];
    const path: P[] = [];
    for (let c = goal; c !== start; c = prev.get(c)!) path.unshift([c % W, Math.floor(c / W)]);
    return path;
  }

  private fidget(): void {
    for (const sp of this.sprites.values()) {
      if (!sp.target || sp.pose !== 'stand' || sp.leaving || sp.path.length) continue;
      if (Math.random() > 0.35 || this.tweens.isTweening(sp.body)) continue;
      const base = feet(sp.target[0], sp.target[1]);
      const dx = Phaser.Math.Between(-6, 6);
      sp.actor.face(dx < -2 ? 'left' : dx > 2 ? 'right' : 'down');
      this.tweens.add({ targets: sp.body, x: base.x + dx, y: base.y + Phaser.Math.Between(-3, 3), duration: 600, ease: 'Sine.easeInOut' });
    }
  }
}

/** Tiles ocupados por móveis (camas, construções, hortas e os móveis fixos). */
function furniture(s: ShelterState): Set<number> {
  const out = new Set<number>();
  const add = ([x, y]: P) => out.add(y * W + x);
  BEDS.slice(0, s.buildings.bed).forEach(({ slot: [x, y] }) => {
    add([x, y]);
    add([x, y - 1]);
  });
  DECOR.forEach((d) => d.block.forEach(add));
  if (s.buildings.workbench) BUILT.workbench.block.forEach(add);
  if (s.buildings.stove) BUILT.stove.block.forEach(add);
  if (s.buildings.filter) BUILT.filter.block.forEach(add);
  if (s.buildings.latrine) BUILT.latrine.block.forEach(add);
  if (s.buildings.radio) BUILT.radio.block.forEach(add);
  COLLECTORS.slice(0, s.buildings.rainCollector).forEach((c) => c.block.forEach(add));
  STATIONS.gardens.slice(0, s.buildings.garden).forEach(([x, y]) => {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) add([x + i, y + j]);
  });
  return out;
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


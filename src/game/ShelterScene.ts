import Phaser from 'phaser';
import { emotionOf, hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState, ShelterSurvivor } from '../sim/shelter/types';
import { TILE, WALL_H, box, enablePan, feet, rowDepth, setupObliqueCamera, wall } from './oblique';
import { artUrl } from './art';
import { ensureIcon, iconFor } from './icons';
import { NightLight, makeRain, softShadow, type LightSource, type OpenArea } from './night';
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
  radio: [16, 10] as P,
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

const isYard = (x: number, y: number) => x >= 19 && y >= 9 && y <= 18;

/** Número estável por tile, para variar o chão sem sortear a cada desenho. */
const hash = (x: number, y: number, k = 0): number => (((x * 73856093) ^ (y * 19349663) ^ (k * 83492791)) >>> 0) % 1000;

type FloorKind = 'yard' | 'tile' | 'concrete' | 'wood';
/** Piso de cada cômodo: quintal de terra, cozinha e latrina de azulejo, oficina e depósito de cimento. */
const floorOf = (x: number, y: number): FloorKind => {
  if (isYard(x, y)) return 'yard';
  if (x >= 19) return 'concrete';
  if (x >= 11 && x <= 17 && y <= 7) return 'tile';
  if (y >= 15 && x <= 5) return 'tile';
  if (y >= 15 && x >= 7 && x <= 17) return 'concrete';
  return 'wood';
};

function floorTile(f: Phaser.GameObjects.Graphics, x: number, y: number, px: number, py: number): void {
  const h = hash(x, y);
  switch (floorOf(x, y)) {
    case 'yard': {
      f.fillStyle([0x3b4a24, 0x37451f, 0x3f4a26, 0x414427][h % 4]).fillRect(px, py, TILE, TILE);
      // Terra batida e tufos de mato.
      if (h % 5 === 0) f.fillStyle(0x4a3f2a, 0.7).fillEllipse(px + 8 + (h % 12), py + 10 + (h % 9), 16, 9);
      for (let k = 0; k < 3; k++) {
        const t = hash(x, y, k + 1);
        f.fillStyle(t % 3 ? 0x4c5e2e : 0x5d6b33).fillRect(px + (t % 25), py + ((t >> 3) % 22) + 2, 2, 3 + (t % 3));
      }
      break;
    }
    case 'tile': {
      f.fillStyle(h % 7 ? 0x6a665a : 0x5f5b50).fillRect(px, py, TILE, TILE);
      f.lineStyle(1, 0x45423a, 0.9);
      for (let k = 0; k <= TILE; k += 7) {
        f.lineBetween(px + k, py, px + k, py + TILE);
        f.lineBetween(px, py + k, px + TILE, py + k);
      }
      // Azulejo quebrado e encardido aqui e ali.
      if (h % 6 === 0) f.fillStyle(0x3d3a33).fillRect(px + 7 * (h % 4), py + 7 * ((h >> 2) % 4), 7, 7);
      if (h % 9 === 0) f.fillStyle(0x4a4030, 0.5).fillEllipse(px + 14, py + 14, 20, 12);
      break;
    }
    case 'concrete': {
      f.fillStyle([0x504d47, 0x4c4943, 0x54514a][h % 3]).fillRect(px, py, TILE, TILE);
      if (h % 4 === 0) f.fillStyle(0x3f3c37, 0.6).fillEllipse(px + 6 + (h % 16), py + 8 + (h % 13), 14 + (h % 8), 8);
      if (h % 7 === 0) {
        // Rachadura.
        f.lineStyle(1, 0x2f2d29, 0.9).lineBetween(px + (h % 10), py + 2, px + 12 + (h % 9), py + 14);
        f.lineBetween(px + 12 + (h % 9), py + 14, px + 8 + (h % 14), py + TILE - 2);
      }
      break;
    }
    default: {
      // Tábuas: cada uma num tom, com emendas, nós e manchas.
      for (const half of [0, 1]) {
        const t = hash(x, y, half + 7);
        f.fillStyle([0x4a3b2c, 0x46382a, 0x4e3e2e, 0x433527][t % 4]).fillRect(px, py + half * (TILE / 2), TILE, TILE / 2);
        const joint = (x + y + half) % 2 ? 8 : 20;
        f.lineStyle(1, 0x33281d, 0.9).lineBetween(px + joint, py + half * (TILE / 2), px + joint, py + (half + 1) * (TILE / 2));
        if (t % 9 === 0) f.fillStyle(0x33281d).fillRect(px + 3 + (t % 20), py + half * (TILE / 2) + 5, 2, 2);
      }
      f.lineStyle(1, 0x33281d, 0.9).lineBetween(px, py + TILE / 2, px + TILE, py + TILE / 2);
      f.lineBetween(px, py + TILE, px + TILE, py + TILE);
      if (h % 13 === 0) f.fillStyle(0x2c2219, 0.45).fillEllipse(px + 14, py + 14, 22, 13);
    }
  }
}

interface Sprite {
  actor: Actor;
  body: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  target: P | null;
  /** Tiles que ainda faltam percorrer. */
  path: P[];
  /** Como fica ao chegar: em pé, na cama ou no chão. */
  pose: Pose;
  /** Está indo embora pela porta; some ao chegar nela. */
  leaving: boolean;
}

export class ShelterScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private floor!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Graphics[] = [];
  private night!: NightLight;
  /** Verdadeiro quando a pintura do abrigo carregou; senão a casa é desenhada por código. */
  private painted = false;
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
    if (!this.textures.exists('shelter-bg')) this.load.image('shelter-bg', artUrl('shelter'));
    for (const key of PROPS) if (!this.textures.exists(key)) this.load.image(key, artUrl(key));
  }

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.sprites.clear();
    this.populated = false;
    this.decor = [];
    setupObliqueCamera(this);
    // No celular começa olhando para a sala, perto da porta.
    enablePan(this, W * TILE, H * TILE, { x: 10 * TILE, y: 12 * TILE });
    this.painted = [...PROPS, 'shelter-bg'].every((k) => this.textures.exists(k) && this.textures.get(k).key !== '__MISSING');
    if (this.painted) this.buildPainted();
    this.floor = this.add.graphics().setDepth(1);
    this.rows = Array.from({ length: H }, (_, y) => this.add.graphics().setDepth(rowDepth(y, 5)));
    for (const r of ROOMS) {
      this.add.text(r.at[0] * TILE + 4, r.at[1] * TILE + 3, r.name, { fontFamily: 'monospace', fontSize: '10px', color: '#c9bba3' }).setAlpha(0.55).setDepth(1);
    }
    this.night = new NightLight(this, W * TILE, H * TILE + WALL_H);
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.fidget() });
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.night.flicker() });
    // Chuva no quintal, a única parte da casa sem telhado.
    this.rain = makeRain(this, 19 * TILE, 8 * TILE, 27 * TILE, 18 * TILE);
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
    const yard: OpenArea = { x: 19 * TILE, y: 9 * TILE, w: 8 * TILE, h: 10 * TILE, amount: isNight(h) ? 0.3 : dusk ? 0.55 : 0.9 };
    const day = !isNight(h) && !dusk;
    this.night.set(isNight(h) ? 0.68 : dusk ? 0.45 : 0.3, day ? this.lightSources(s).filter((l) => l.fire) : this.lightSources(s), [yard]);
    if (this.rain.emitting !== s.raining) s.raining ? this.rain.start() : this.rain.stop();
  }

  /**
   * A casa pintada (npm run art -- shelter) foi feita sobre a planta exata do jogo.
   * O fundo vai inteiro para o chão; as paredes são recortes da mesma imagem, uma faixa
   * por linha, para as pessoas continuarem passando atrás delas.
   */
  private buildPainted(): void {
    const src = this.textures.get('shelter-bg').getSourceImage();
    const k = src.width / (W * TILE);
    const piece = () => this.add.image(0, -WALL_H, 'shelter-bg').setOrigin(0).setDisplaySize(W * TILE, BG_H).setTint(BG_TINT);
    piece().setDepth(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!isWall(x, y)) continue;
        // Junta os tiles de parede vizinhos da linha num recorte só.
        let end = x;
        const front = !isWall(x, y + 1);
        while (isWall(end + 1, y) && !isWall(end + 1, y + 1) === front) end++;
        const h = TILE + (front ? WALL_H : 0);
        piece().setCrop(x * TILE * k, y * TILE * k, (end - x + 1) * TILE * k, h * k).setDepth(rowDepth(y, 5));
        x = end;
      }
    }
    if (!this.textures.exists('shelter-vignette')) {
      const w = W * TILE;
      const h = H * TILE + WALL_H;
      const tex = this.textures.createCanvas('shelter-vignette', w, h)!;
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, w * 0.72);
      grad.addColorStop(0, 'rgba(5, 5, 6, 0)');
      grad.addColorStop(1, 'rgba(5, 5, 6, 0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      tex.refresh();
    }
    this.add.image(0, -WALL_H, 'shelter-vignette').setOrigin(0).setDepth(80000);
  }

  /** Móvel pintado: base no chão em (cx, baseY), com a largura dada em tiles. */
  private prop(key: string, cx: number, baseY: number, widthTiles: number, row: number): Phaser.GameObjects.Image {
    const img = this.add.image(cx, baseY, key).setOrigin(0.5, 1).setDepth(rowDepth(row, 6)).setTint(0xcbc4b8);
    img.setScale((widthTiles * TILE) / img.width);
    this.decor.push(img);
    // Sombra de contato debaixo do objeto, não abaixo dele: a mancha ocupa a "pegada" no chão,
    // que na vista de cima é a metade de baixo da imagem. Uma faixa mais escura cola a base.
    const w = widthTiles * TILE;
    const footprint = Math.min(img.displayHeight * 0.55, w * 0.6);
    const shadow = softShadow(this);
    this.decor.push(
      this.add.image(cx + 1, baseY - footprint * 0.45, shadow).setDisplaySize(w * 1.12, footprint * 1.1).setAlpha(0.6).setDepth(2),
      this.add.image(cx, baseY - 2, shadow).setDisplaySize(w * 0.85, 6).setAlpha(0.55).setDepth(2),
    );
    return img;
  }

  private drawPainted(s: ShelterState): void {
    const f = this.floor;
    const mark = (px: number, py: number, w: number, h: number) => {
      f.lineStyle(1, 0xf1ebe0, 0.28).strokeRect(px + 3.5, py + 3.5, w - 7, h - 7);
      f.lineStyle(1, 0xf1ebe0, 0.16).lineBetween(px + 6, py + 6, px + w - 6, py + h - 6);
    };
    const [dx, dy] = FRONT_DOOR;
    if (s.buildings.barricade > 0) this.prop('prop-barricade', dx * TILE + TILE / 2, dy * TILE - 3, 2 + s.buildings.barricade * 0.45, dy - 1);
    BED_SLOTS.forEach(([x, y], i) => {
      if (i < s.buildings.bed) this.prop('prop-bed', x * TILE + TILE / 2, (y + 1) * TILE + 3, 1.6, y);
    });
    const station = (p: P, key: string, built: boolean, widthTiles: number) => {
      if (built) this.prop(key, p[0] * TILE + TILE / 2, (p[1] + 1) * TILE - 2, widthTiles, p[1]);
      else mark(p[0] * TILE, p[1] * TILE, TILE, TILE);
    };
    station(STATIONS.workbench, 'prop-workbench', s.buildings.workbench > 0, 1.9);
    station(STATIONS.stove, 'prop-stove', s.buildings.stove > 0, 0.95);
    station(STATIONS.filter, 'prop-filter', s.buildings.filter > 0, 1.05);
    station(STATIONS.latrine, 'prop-latrine', s.buildings.latrine > 0, 1.25);
    station(STATIONS.radio, 'prop-radio', s.buildings.radio > 0, 1.3);
    STATIONS.collectors.forEach((p, i) => station(p, 'prop-collector', i < s.buildings.rainCollector, 1.5));
    STATIONS.gardens.forEach((p, i) => {
      const px = p[0] * TILE;
      const py = p[1] * TILE;
      if (i < s.buildings.garden) {
        const bed = this.prop('prop-garden', px + TILE * 1.5, py + TILE * 2 - 2, 3, p[1] + 1);
        // Horta sem água perde o verde.
        if (!s.gardenWatered) bed.setTint(0xc9b48a);
      } else {
        mark(px, py, TILE * 3, TILE * 2);
      }
    });
    // Depósito: as pilhas crescem com o estoque de comida, água e material.
    [s.resources.food, s.resources.water, s.resources.wood + s.resources.scrap].forEach((amount, i) => {
      if (amount < 1) return;
      this.prop('prop-crates', (9 + i * 3) * TILE, 18 * TILE - 4, 0.75 + Math.min(4, Math.ceil(amount / 4)) * 0.16, 17).setFlipX(i === 1);
    });
    if (s.resources.waste > 6) {
      const n = Math.min(10, Math.floor(s.resources.waste / 2));
      for (let k = 0; k < n; k++) f.fillStyle(0x2a2718, 0.8).fillEllipse((2 + ((k * 7) % 4)) * TILE + 10, (15 + (k % 3)) * TILE + 14, 12 + (k % 3) * 3, 7);
    }
  }

  private drawHouse(s: ShelterState): void {
    const f = this.floor;
    f.clear();
    for (const g of this.rows) g.clear();
    for (const o of this.decor) o.destroy();
    this.decor = [];
    if (this.painted) return this.drawPainted(s);

    f.fillStyle(0x0a0908).fillRect(0, -WALL_H, W * TILE, H * TILE + WALL_H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isWall(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        floorTile(f, x, y, px, py);
      }
    }
    // Sombra onde o chão encontra as paredes: dá peso à casa.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (isWall(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        if (isWall(x, y - 1)) {
          f.fillStyle(0x000000, 0.3).fillRect(px, py, TILE, 4);
          f.fillStyle(0x000000, 0.16).fillRect(px, py + 4, TILE, 5);
          f.fillStyle(0x000000, 0.07).fillRect(px, py + 9, TILE, 5);
        }
        if (isWall(x - 1, y)) f.fillStyle(0x000000, 0.16).fillRect(px, py, 4, TILE);
        if (isWall(x + 1, y)) f.fillStyle(0x000000, 0.16).fillRect(px + TILE - 4, py, 4, TILE);
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

    const station = (p: P, kind: Station, built: boolean, color: number, h = 12) => {
      const px = p[0] * TILE;
      const py = p[1] * TILE;
      if (built) {
        const g = this.rows[p[1]];
        box(g, px + 3, py + 6, TILE - 6, TILE - 10, h, color);
        detail(g, kind, px + 3, py + 6 - h, TILE - 10, h);
      } else {
        // Lugar reservado: só um risco de giz no chão.
        f.lineStyle(1, 0xa89a80, 0.3).strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
        f.lineStyle(1, 0xa89a80, 0.15).lineBetween(px + 6, py + 6, px + TILE - 6, py + TILE - 6);
      }
    };
    station(STATIONS.workbench, 'workbench', s.buildings.workbench > 0, 0x8a6a3e);
    station(STATIONS.stove, 'stove', s.buildings.stove > 0, 0x6a6a6a, 14);
    station(STATIONS.filter, 'filter', s.buildings.filter > 0, 0x4f7394, 18);
    station(STATIONS.latrine, 'latrine', s.buildings.latrine > 0, 0x9a978a, 10);
    station(STATIONS.radio, 'radio', s.buildings.radio > 0, 0x6a5238, 11);
    STATIONS.collectors.forEach((p, i) => station(p, 'collector', i < s.buildings.rainCollector, 0x3d6f8f, 16));

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
        f.lineStyle(1, 0xa89a80, 0.3).strokeRect(px + 3.5, py + 3.5, TILE * 3 - 7, TILE * 2 - 7);
        f.lineStyle(1, 0xa89a80, 0.15).lineBetween(px + 6, py + 6, px + TILE * 3 - 6, py + TILE * 2 - 6);
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
      if (night && v.task !== 'guard') {
        const inBed = bedIndex < s.buildings.bed;
        spot = inBed ? BED_SLOTS[bedIndex] : SPOTS.floorSleep[(bedIndex - s.buildings.bed) % SPOTS.floorSleep.length];
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
    const sp: Sprite = { actor, body, icon, target: at, path: [], pose: 'stand', leaving: false };
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
    const to = feet(next[0], next[1]);
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

/** Tiles com móveis construídos (camas, bancadas, hortas, caixotes). */
const PROPS = ['prop-bed', 'prop-workbench', 'prop-stove', 'prop-filter', 'prop-latrine', 'prop-radio', 'prop-collector', 'prop-garden', 'prop-barricade', 'prop-crates'];
/** A pintura é 4:3: cobre a cena (574 de altura) e mais uma sobra embaixo. */
const BG_H = 588;
/** Escurece um pouco a pintura, que veio clara demais para o tom do jogo. */
const BG_TINT = 0x9f998f;

type Station = 'workbench' | 'stove' | 'filter' | 'latrine' | 'radio' | 'collector';

/**
 * O que identifica cada móvel, desenhado sobre o bloco no mesmo traço do resto da casa.
 * (x, y) é o canto do topo do bloco, `d` a profundidade do topo e `h` a altura da frente.
 */
function detail(g: Phaser.GameObjects.Graphics, kind: Station, x: number, y: number, d: number, h: number): void {
  const cx = x + 11;
  const cy = y + d / 2;
  switch (kind) {
    case 'workbench':
      g.fillStyle(0x3b3b3b).fillRect(x + 2, y + 3, 6, 4); // morsa
      g.fillStyle(0xbdbdbd).fillRect(x + 10, y + 3, 9, 2); // serrote
      g.fillStyle(0x6b4423).fillRect(x + 10, y + 5, 3, 2);
      g.fillStyle(0xb0392b).fillRect(x + 12, y + 10, 7, 5); // caixa de ferramentas
      g.fillStyle(0x7d2a20).fillRect(x + 12, y + 14, 7, 1);
      break;
    case 'stove':
      g.fillStyle(0x1f1f1f).fillCircle(cx, cy, 6); // boca
      g.fillStyle(0xe0762a).fillCircle(cx, cy, 3);
      g.fillStyle(0xf2c14e).fillRect(cx - 1, cy - 1, 2, 2);
      g.fillStyle(0x1f1f1f).fillRect(x + 6, y + d + 3, 10, h - 6); // porta do fogo
      g.fillStyle(0xe0762a).fillRect(x + 8, y + d + 5, 6, h - 10);
      g.fillStyle(0x4a4a4a).fillRect(x + 17, y - 8, 3, 10); // chaminé
      break;
    case 'filter':
      g.fillStyle(0xb9b3a3).fillCircle(cx, cy, 7); // pano e areia
      g.fillStyle(0x2b2b2b).fillCircle(cx, cy, 4); // carvão
      g.fillStyle(0x9a9a9a).fillRect(x + 15, y + d + h - 7, 4, 2); // torneira
      g.fillStyle(0x7fb2d6).fillRect(x + 16, y + d + h - 5, 2, 4);
      break;
    case 'latrine':
      g.fillStyle(0x2a2620).fillEllipse(cx, cy, 11, 7);
      g.fillStyle(0xe8e0d0).fillRect(x + 17, y + 2, 3, 4); // papel
      break;
    case 'radio':
      g.fillStyle(0x2b2b30).fillRect(x + 3, y + 3, 16, 10);
      g.fillStyle(0x45454d).fillRect(x + 3, y + 3, 16, 2);
      g.fillStyle(0x6fd06a).fillRect(x + 5, y + 7, 2, 2); // luz
      g.fillStyle(0xd9b45b).fillRect(x + 9, y + 7, 8, 2); // mostrador
      g.fillStyle(0x8a8a8a).fillCircle(x + 7, y + 11, 1.5);
      g.lineStyle(1, 0xcfcfcf, 0.9).lineBetween(x + 18, y + 3, x + 21, y - 10); // antena
      break;
    case 'collector':
      g.fillStyle(0x8c8f7a).fillRect(x + 1, y + 1, 20, d - 2); // lona
      g.fillStyle(0x70735f).fillTriangle(x + 1, y + 1, x + 21, y + 1, cx, cy);
      g.fillStyle(0x2f5f80).fillCircle(cx, cy, 3); // água
      break;
  }
}

function furniture(s: ShelterState): Set<number> {
  const out = new Set<number>();
  const add = (x: number, y: number) => out.add(y * W + x);
  BED_SLOTS.slice(0, s.buildings.bed).forEach(([x, y]) => add(x, y));
  if (s.buildings.workbench) add(...STATIONS.workbench);
  if (s.buildings.stove) add(...STATIONS.stove);
  if (s.buildings.filter) add(...STATIONS.filter);
  if (s.buildings.latrine) add(...STATIONS.latrine);
  if (s.buildings.radio) add(...STATIONS.radio);
  STATIONS.collectors.slice(0, s.buildings.rainCollector).forEach(([x, y]) => add(x, y));
  STATIONS.gardens.slice(0, s.buildings.garden).forEach(([x, y]) => {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) add(x + i, y + j);
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


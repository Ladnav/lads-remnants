import Phaser from 'phaser';

/**
 * Prova de estilo em pixel art (página pixel.html). Um canto do abrigo em peças de 32×32 desenhadas
 * por código, móveis e a Marta vindos das folhas do Gemini reduzidas na grade original delas
 * (scripts/pixel-proof.mjs), e luz em degraus com pontilhado. Não usa nada das regras do jogo.
 */

export const TILE = 32;
const COLS = 20;
const ROWS = 12;
export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;
const FRAME = 80;

// '#' parede · k azulejo · w tábua · c cimento · g quintal
const MAP = [
  '####################',
  '#kkkkkkk#wwwwwwwwww#',
  '#kkkkkkk#wwwwwwwwww#',
  '#kkkkkkkwwwwwwwwwww#',
  '#kkkkkkk#wwwwwwwwww#',
  '###k#####ww#########',
  '#cccccccccc#ggggggg#',
  '#cccccccccccggggggg#',
  '#cccccccccc#ggggggg#',
  '#cccccccccc#ggggggg#',
  '#cccccccccc#ggggggg#',
  '####################',
];

const C = {
  wood0: '#3a2c22',
  wood1: '#574233',
  wood2: '#6c4f34',
  wood3: '#7d5c3c',
  wood4: '#8d6a45',
  tile0: '#6c6862',
  tile1: '#9a9383',
  tile2: '#a9a396',
  tile3: '#b7b1a4',
  stain: '#8a8273',
  conc0: '#3f4246',
  conc1: '#55514a',
  conc2: '#5f5c56',
  conc3: '#6b6862',
  grass0: '#3b4c2a',
  grass1: '#4d6333',
  grass2: '#6d8a45',
  grass3: '#93a861',
  dirt0: '#4f3c2e',
  dirt1: '#6a5541',
  dirt2: '#7d6750',
  wallTop: '#cdc6b9',
  wallTop2: '#b4ad9f',
  wallTop3: '#9d968a',
  wallFace: '#8c8575',
  wallFace2: '#7a7366',
  wallFace3: '#696357',
  brick: '#8f3324',
  brick2: '#b04a2f',
  mortar: '#a39c8d',
};

/** Número estável por posição: o mesmo piso toda vez, sem sortear de novo. */
const hash = (x: number, y: number, s = 0): number => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const at = (x: number, y: number): string => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? '#' : MAP[y][x]);

interface Prop {
  key: string;
  cx: number;
  bottom: number;
}

const T = TILE;
// Encostados nas paredes, como numa casa de verdade: cabeceira, fogão, prateleira e bancada contra a
// parede de cima (a parte de trás cobre a face da parede); nada bloqueia as portas.
const PROPS: Prop[] = [
  { key: 'stove', cx: 2 * T + 8, bottom: T + 44 },
  { key: 'shelf', cx: 6 * T, bottom: T + 40 },
  { key: 'table', cx: 4 * T + 8, bottom: 4 * T + 8 },
  { key: 'chair', cx: 2 * T + 16, bottom: 4 * T + 10 },
  { key: 'bed', cx: 10 * T + 8, bottom: T + 69 },
  { key: 'bed', cx: 12 * T + 16, bottom: T + 69 },
  { key: 'bed', cx: 14 * T + 24, bottom: T + 69 },
  { key: 'sacks', cx: 17 * T + 24, bottom: 5 * T - 4 },
  { key: 'crates', cx: T + 28, bottom: 6 * T + 40 },
  { key: 'workbench', cx: 6 * T + 16, bottom: 6 * T + 44 },
  { key: 'barricade', cx: 6 * T, bottom: 11 * T - 2 },
  { key: 'barrel', cx: 13 * T, bottom: 6 * T + 38 },
  { key: 'bucket', cx: 14 * T + 8, bottom: 7 * T + 12 },
  { key: 'garden', cx: 16 * T + 8, bottom: 9 * T + 24 },
];

interface Light {
  x: number;
  y: number;
  r: number;
  warm: boolean;
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;
type Px = (x: number, y: number, c: string) => void;

/** Matriz de Bayer 4×4: decide quais pixels acendem em cada degrau de luz. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class PixelTestScene extends Phaser.Scene {
  private marta!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Image;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private target: { x: number; y: number } | null = null;
  private facing: 'down' | 'left' | 'right' | 'up' = 'down';
  private blocks: Phaser.Geom.Rectangle[] = [];
  private night = false;
  private dark!: Phaser.Textures.CanvasTexture;
  private flicker = 0;
  /** Ampliação inteira (pixels físicos por pixel do jogo) e se a câmera está de perto. */
  private zoom = 1;
  private close = false;

  constructor() {
    super('pixel-test');
  }

  preload(): void {
    this.load.spritesheet('marta', 'pixel/marta.png', { frameWidth: FRAME, frameHeight: FRAME });
    for (const k of new Set(PROPS.map((p) => p.key))) this.load.image(k, `pixel/${k}.png`);
  }

  create(): void {
    this.drawMap();
    this.makeShadow();

    for (const p of PROPS) {
      const img = this.add.image(Math.round(p.cx), p.bottom, p.key).setOrigin(0.5, 1).setDepth(p.bottom);
      const sh = this.footShadow(p.key);
      // A sombra fica atrás do móvel: aparece entre as pernas, embaixo do tampo e numa borda em volta.
      this.add.image(Math.round(p.cx - img.width / 2) - 1, p.bottom - img.height, sh.key).setOrigin(0).setDepth(1);
      this.blocks.push(new Phaser.Geom.Rectangle(p.cx - img.width / 2 + 3, p.bottom - sh.depth, img.width - 6, sh.depth));
    }

    for (const [dir, row] of [['down', 0], ['left', 1], ['right', 2], ['up', 3]] as const) {
      this.anims.create({ key: `walk-${dir}`, frames: this.anims.generateFrameNumbers('marta', { start: row * 4, end: row * 4 + 3 }), frameRate: 7, repeat: -1 });
    }
    this.shadow = this.add.image(0, 0, 'px-shadow').setDisplaySize(30, 8);
    this.marta = this.add.sprite(6 * T, 9 * T, 'marta', 0).setOrigin(0.5, 0.96);

    this.keys = this.input.keyboard!.createCursorKeys();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.target = { x: p.worldX, y: p.worldY };
    });

    this.dark = this.textures.createCanvas('px-dark', VIEW_W, VIEW_H)!;
    this.add.image(0, 0, 'px-dark').setOrigin(0).setDepth(100000);
    this.time.addEvent({ delay: 150, loop: true, callback: () => this.drawLight() });
    this.drawLight();
    this.applyCamera();
  }

  setZoom(z: number): void {
    this.zoom = z;
    if (this.sys?.isActive()) this.applyCamera();
  }

  toggleNight(): boolean {
    this.night = !this.night;
    this.drawLight();
    return this.night;
  }

  /** Câmera de perto (2× mais) seguindo a Marta, ou a sala inteira. */
  setCloseUp(on: boolean): void {
    this.close = on;
    this.applyCamera();
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, VIEW_W, VIEW_H);
    const z = this.close ? this.zoom * 2 : this.zoom;
    cam.setZoom(z);
    // Se a tela não mostra a sala inteira (celular), a câmera segue a Marta.
    if (this.close || cam.width / z < VIEW_W - 1 || cam.height / z < VIEW_H - 1) cam.startFollow(this.marta, true, 0.15, 0.15);
    else cam.stopFollow().centerOn(VIEW_W / 2, VIEW_H / 2);
  }

  update(_t: number, dt: number): void {
    const speed = 84 * (dt / 1000);
    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown) dx = -1;
    else if (this.keys.right.isDown) dx = 1;
    if (this.keys.up.isDown) dy = -1;
    else if (this.keys.down.isDown) dy = 1;
    if (dx || dy) this.target = null;
    else if (this.target) {
      const tx = this.target.x - this.marta.x;
      const ty = this.target.y - this.marta.y;
      const d = Math.hypot(tx, ty);
      if (d < 3) this.target = null;
      else {
        dx = tx / d;
        dy = ty / d;
      }
    }
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const nx = this.marta.x + (dx / len) * speed;
      const ny = this.marta.y + (dy / len) * speed;
      const okX = this.free(nx, this.marta.y);
      const okY = this.free(this.marta.x, ny);
      if (okX) this.marta.x = nx;
      if (okY) this.marta.y = ny;
      if (!okX && !okY) this.target = null;
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      this.marta.play(`walk-${this.facing}`, true);
    } else {
      this.marta.stop();
      this.marta.setFrame({ down: 0, left: 4, right: 8, up: 12 }[this.facing]);
    }
    this.marta.setDepth(this.marta.y);
    this.shadow.setPosition(Math.round(this.marta.x), Math.round(this.marta.y) - 2).setDepth(this.marta.y - 0.5);
  }

  /** Os pés (uma caixinha de 16×8) cabem ali sem entrar em parede nem móvel? */
  private free(x: number, y: number): boolean {
    const box = new Phaser.Geom.Rectangle(x - 8, y - 8, 16, 8);
    for (const [px, py] of [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]) {
      if (at(Math.floor(px / T), Math.floor(py / T)) === '#') return false;
    }
    return !this.blocks.some((b) => Phaser.Geom.Intersects.RectangleToRectangle(b, box));
  }

  /**
   * Sombra pela área que o móvel ocupa no chão: um retângulo de cantos cortados, da largura da parte de
   * baixo do objeto e com a profundidade do tampo, deslocado 2 px para a direita e 1 para baixo (luz do
   * alto à esquerda). Dois tons, borda de 1 px mais clara. Calculada da própria imagem.
   */
  private footShadow(key: string): { key: string; depth: number } {
    const id = `shadow-${key}`;
    const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const w = src.width;
    const h = src.height;
    const depth = Math.max(8, Math.round(h * (key === 'bed' ? 0.75 : 0.34)));
    if (!this.textures.exists(id)) {
      const probe = document.createElement('canvas');
      probe.width = w;
      probe.height = h;
      const pctx = probe.getContext('2d')!;
      pctx.drawImage(src, 0, 0);
      const alpha = pctx.getImageData(0, 0, w, h).data;
      let bottom = 0;
      let x0 = w;
      let x1 = 0;
      for (let y = Math.floor(h * 0.55); y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (alpha[(y * w + x) * 4 + 3] < 128) continue;
          bottom = Math.max(bottom, y);
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
        }
      }
      const tex = this.textures.createCanvas(id, w + 6, h + 4)!;
      const ctx = tex.getContext();
      const top = bottom - depth + 1;
      for (let y = top; y <= bottom + 2; y++) {
        for (let x = x0; x <= x1 + 2; x++) {
          const edge = y === top || y === bottom + 2 || x === x0 || x === x1 + 2;
          const corner = (y === top || y === bottom + 2) && (x === x0 || x === x1 + 2);
          if (corner) continue;
          ctx.fillStyle = edge ? 'rgba(17,17,19,0.22)' : 'rgba(17,17,19,0.45)';
          ctx.fillRect(x + 2 + 1, y + 1, 1, 1);
        }
      }
      tex.refresh();
    }
    return { key: id, depth };
  }

  /** Sombra de contato: elipse em degraus (3 tons), sem borda borrada. */
  private makeShadow(): void {
    const W = 32;
    const H = 10;
    const t = this.textures.createCanvas('px-shadow', W, H)!;
    const ctx = t.getContext();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = Math.hypot((x + 0.5 - W / 2) / (W / 2), (y + 0.5 - H / 2) / (H / 2));
        if (k > 1) continue;
        ctx.fillStyle = `rgba(17,17,19,${k < 0.55 ? 0.5 : k < 0.8 ? 0.36 : 0.2})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    t.refresh();
  }

  // ---------- Piso e paredes, pixel a pixel ----------

  private drawMap(): void {
    const tex = this.textures.createCanvas('px-map', VIEW_W, VIEW_H)!;
    const ctx = tex.getContext();
    const px: Px = (x, y, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    const rect: Rect = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };

    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        const kind = at(tx, ty);
        const X = tx * T;
        const Y = ty * T;
        if (kind === 'w') this.wood(rect, px, X, Y, tx, ty);
        else if (kind === 'k') this.tiles(rect, px, X, Y, tx, ty);
        else if (kind === 'c') this.concrete(rect, px, X, Y, tx, ty);
        else if (kind === 'g') this.grass(rect, px, X, Y, tx, ty);
      }
    }

    // Paredes laterais jogam sombra no chão, para os cômodos não parecerem chapados.
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (at(tx, ty) !== '#' && at(tx - 1, ty) === '#') {
          ctx.fillStyle = 'rgba(17,17,19,0.25)';
          ctx.fillRect(tx * T, ty * T, 3, T);
        }
      }
    }

    // Paredes por cima: tampo claro e, onde há chão embaixo, a face da frente com tijolo aparecendo.
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLS; tx++) {
        if (at(tx, ty) !== '#') continue;
        const X = tx * T;
        const Y = ty * T;
        const face = ty + 1 < ROWS && at(tx, ty + 1) !== '#';
        const topH = face ? 12 : T;
        rect(X, Y, T, topH, C.wallTop);
        for (let i = 0; i < 10; i++) {
          const sx = X + Math.floor(hash(tx, ty, 200 + i) * T);
          const sy = Y + Math.floor(hash(ty, tx, 200 + i) * topH);
          px(sx, sy, i % 4 ? C.wallTop2 : C.wallTop3);
        }
        // Quinas: borda mais escura onde a parede termina.
        if (at(tx - 1, ty) !== '#') rect(X, Y, 2, topH, C.wallTop2);
        if (at(tx + 1, ty) !== '#') rect(X + T - 2, Y, 2, topH, C.wallTop3);
        if (ty > 0 && at(tx, ty - 1) !== '#') rect(X, Y, T, 2, C.wallTop2);
        if (face) {
          rect(X, Y + 12, T, 20, C.wallFace);
          rect(X, Y + 12, T, 2, C.wallTop3);
          rect(X, Y + 24, T, 1, C.wallFace2);
          // Sujeira escorrendo.
          for (let i = 0; i < 4; i++) {
            const sx = X + Math.floor(hash(tx, ty, 220 + i) * T);
            rect(sx, Y + 14 + Math.floor(hash(tx, ty, 230 + i) * 6), 1, 3 + Math.floor(hash(ty, tx, 240 + i) * 6), C.wallFace2);
          }
          if (hash(tx, ty, 300) < 0.4) {
            // Reboco caído: um pedaço de tijolo à vista, com rejunte.
            const bx = X + 4 + Math.floor(hash(tx, ty, 301) * 12);
            rect(bx - 1, Y + 16, 14, 9, C.wallFace3);
            rect(bx, Y + 17, 6, 3, C.brick2);
            rect(bx + 7, Y + 17, 5, 3, C.brick);
            rect(bx + 3, Y + 21, 7, 3, C.brick);
            rect(bx, Y + 20, 12, 1, C.mortar);
          }
          rect(X, Y + 30, T, 2, C.wood0);
          // Sombra no chão logo abaixo, em dois degraus.
          ctx.fillStyle = 'rgba(17,17,19,0.42)';
          ctx.fillRect(X, Y + T, T, 4);
          ctx.fillStyle = 'rgba(17,17,19,0.2)';
          ctx.fillRect(X, Y + T + 4, T, 4);
        }
      }
    }
    tex.refresh();
    this.add.image(0, 0, 'px-map').setOrigin(0).setDepth(0);
  }

  private wood(rect: Rect, px: Px, X: number, Y: number, tx: number, ty: number): void {
    // Tábuas de 8 px com emendas desencontradas, veios, nós e brilho de desgaste.
    for (let p = 0; p < 4; p++) {
      const py = Y + p * 8;
      const row = ty * 4 + p;
      const tone = [C.wood2, C.wood1, C.wood3, C.wood2][Math.floor(hash(tx, row) * 4)];
      rect(X, py, T, 8, tone);
      rect(X, py + 7, T, 1, C.wood0);
      rect(X, py, T, 1, C.wood3);
      // Emenda a cada 48 px, deslocada por fileira.
      const off = Math.floor(hash(row, 7) * 48);
      for (let gx = X; gx < X + T; gx++) {
        if ((gx + off) % 48 === 0) {
          rect(gx, py, 1, 7, C.wood0);
          rect(gx + 1, py + 1, 1, 6, C.wood4);
        }
      }
      for (let i = 0; i < 3; i++) {
        const gx = X + Math.floor(hash(tx, row, 10 + i) * 24);
        rect(gx, py + 3 + (i % 2), 4 + Math.floor(hash(tx, row, 20 + i) * 6), 1, C.wood1);
      }
      if (hash(tx, row, 3) < 0.15) {
        const kx = X + 4 + Math.floor(hash(tx, row, 4) * 22);
        rect(kx, py + 3, 3, 2, C.wood0);
        px(kx + 1, py + 2, C.wood1);
      }
      if (hash(tx, row, 5) < 0.3) rect(X + Math.floor(hash(tx, row, 6) * 26), py + 2, 5, 1, C.wood4);
    }
  }

  private tiles(rect: Rect, px: Px, X: number, Y: number, tx: number, ty: number): void {
    // Azulejo 16×16 com rejunte, chanfro claro, trincas e manchas.
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        const x0 = X + sx * 16;
        const y0 = Y + sy * 16;
        rect(x0, y0, 16, 16, hash(tx * 2 + sx, ty * 2 + sy) < 0.25 ? C.tile1 : C.tile2);
        rect(x0 + 1, y0 + 1, 14, 1, C.tile3);
        rect(x0 + 1, y0 + 1, 1, 14, C.tile3);
        rect(x0, y0 + 15, 16, 1, C.tile0);
        rect(x0 + 15, y0, 1, 16, C.tile0);
        if (hash(x0, y0, 5) < 0.18) {
          let cx = x0 + 2;
          let cy = y0 + 2 + Math.floor(hash(x0, y0, 6) * 8);
          for (let i = 0; i < 11; i++) {
            px(cx, cy, C.tile0);
            cx++;
            if (hash(cx, cy, 2) < 0.45) cy++;
          }
        }
        if (hash(x0, y0, 8) < 0.15) {
          rect(x0 + 4, y0 + 5, 6, 4, C.stain);
          rect(x0 + 5, y0 + 4, 4, 6, C.stain);
        }
      }
    }
  }

  private concrete(rect: Rect, px: Px, X: number, Y: number, tx: number, ty: number): void {
    rect(X, Y, T, T, C.conc1);
    for (let i = 0; i < 46; i++) {
      const sx = X + Math.floor(hash(tx, ty, i) * T);
      const sy = Y + Math.floor(hash(ty, tx, i) * T);
      px(sx, sy, i % 3 === 0 ? C.conc0 : i % 3 === 1 ? C.conc2 : C.conc3);
    }
    // Junta de dilatação a cada 2 casas e manchas de óleo.
    if (tx % 2 === 0) rect(X, Y, 1, T, C.conc0);
    if (ty % 2 === 0) rect(X, Y, T, 1, C.conc0);
    // Mancha de óleo: um borrão irregular de pontos, não uma bola.
    if (hash(tx, ty, 77) < 0.15) {
      for (let i = 0; i < 26; i++) {
        const a = hash(tx, ty, 80 + i) * Math.PI * 2;
        const r = hash(ty, tx, 80 + i) * 6;
        px(X + 16 + Math.round(Math.cos(a) * r * 1.4), Y + 16 + Math.round(Math.sin(a) * r * 0.8), C.conc0);
      }
    }
  }

  private grass(rect: Rect, px: Px, X: number, Y: number, tx: number, ty: number): void {
    rect(X, Y, T, T, C.grass1);
    // Trilha de terra pisada: da porta da oficina até o barril e a horta.
    const path = ty === 7 && tx <= 14;
    if (path) {
      // Borda irregular: cada coluna começa e termina num ponto diferente.
      for (let x = 0; x < T; x++) {
        const top = 4 + Math.floor(hash(X + x, ty, 31) * 4);
        const bot = 28 - Math.floor(hash(X + x, ty, 32) * 4);
        rect(X + x, Y + top, 1, bot - top, C.dirt1);
      }
      for (let i = 0; i < 40; i++) {
        const sx = X + Math.floor(hash(tx, ty, 60 + i) * T);
        const sy = Y + 4 + Math.floor(hash(ty, tx, 60 + i) * 24);
        px(sx, sy, i % 3 ? C.dirt0 : C.dirt2);
      }
    }
    // Tufos: folhinhas de 3 px com ponta clara.
    for (let i = 0; i < (path ? 8 : 34); i++) {
      const sx = X + Math.floor(hash(tx, ty, 100 + i) * T);
      const sy = Y + Math.floor(hash(ty, tx, 100 + i) * (T - 3));
      if (path && sy > Y + 2 && sy < Y + 26) continue;
      px(sx, sy + 2, C.grass0);
      px(sx, sy + 1, C.grass2);
      px(sx, sy, i % 3 ? C.grass2 : C.grass3);
    }
    for (let i = 0; i < 6; i++) px(X + Math.floor(hash(tx, ty, 150 + i) * T), Y + Math.floor(hash(ty, tx, 150 + i) * T), C.grass0);
  }

  // ---------- Luz em degraus ----------

  private lightSources(): Light[] {
    this.flicker = (this.flicker + 1) % 1000;
    const wob = Math.sin(this.flicker * 1.7) * 4 + Math.sin(this.flicker * 0.6) * 3;
    const out: Light[] = [
      { x: 3 * T, y: 2 * T + 20, r: 120 + wob, warm: true },
      { x: 5 * T, y: 3 * T + 20, r: 62 + wob / 2, warm: true },
    ];
    if (this.night && this.marta) out.push({ x: this.marta.x, y: this.marta.y - 20, r: 86, warm: false });
    return out;
  }

  private drawLight(): void {
    if (!this.dark) return;
    const ctx = this.dark.getContext();
    const img = ctx.createImageData(VIEW_W, VIEW_H);
    const d = img.data;
    const lights = this.lightSources();
    const yard = { x0: 12 * T, y0: 6 * T, x1: 19 * T, y1: 11 * T };
    // A luz trabalha em blocos de 2×2 pixels: pontilhado visível e um quarto da conta.
    for (let y = 0; y < VIEW_H; y += 2) {
      for (let x = 0; x < VIEW_W; x += 2) {
        const outside = x >= yard.x0 && x < yard.x1 && y >= yard.y0 && y < yard.y1;
        // Escuridão base: de dia a casa é penumbra e o quintal é claro; de noite, quase breu.
        const base = this.night ? (outside ? 0.55 : 0.82) : outside ? 0 : 0.18;
        let lit = 0;
        let warm = 0;
        for (const l of lights) {
          const k = 1 - Math.hypot(x - l.x, (y - l.y) * 1.25) / l.r;
          if (k > lit) {
            lit = k;
            warm = l.warm ? k : 0;
          }
        }
        // Quatro degraus com pontilhado entre eles: nada de degradê liso.
        const level = Math.max(0, Math.min(1, lit)) * 4;
        const step = Math.min(4, Math.floor(level) + (level % 1 > BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] ? 1 : 0));
        let r = 17;
        let g = 17;
        let b = 19;
        let alpha = base * (1 - step / 4);
        if (warm > 0.12 && step >= 1 && this.night) {
          // Brilho de fogo: um laranja fraco no lugar do escuro.
          r = 235;
          g = 148;
          b = 83;
          alpha = Math.min(0.09, warm * 0.14);
        } else if (outside && this.night) {
          r = 38;
          g = 48;
          b = 74;
        }
        const A = Math.round(255 * alpha);
        for (let yy = y; yy < y + 2; yy++) {
          for (let xx = x; xx < x + 2; xx++) {
            const i = (yy * VIEW_W + xx) * 4;
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = A;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dark.refresh();
  }
}

import Phaser from 'phaser';
import { TILE, WALL_H } from './oblique';

/**
 * Casa em pixel art desenhada por código, na grade do jogo (TILE 28, paredes que sobem WALL_H).
 * Chão e paredes saem em duas texturas do tamanho da cena, as duas começando WALL_H acima do chão;
 * as paredes depois são recortadas linha por linha para as pessoas passarem atrás delas.
 * Mesmo traço e paleta da prova de estilo (pixel.html).
 */

export type FloorKind = 'wood' | 'tile' | 'concrete' | 'grass' | 'dirt';

export interface HousePlan {
  cols: number;
  rows: number;
  isWall: (x: number, y: number) => boolean;
  floorOf: (x: number, y: number) => FloorKind;
  /** Tiles de parede que são cerca de madeira (borda do quintal), não alvenaria. */
  fence?: (x: number, y: number) => boolean;
  /** Trilhas de terra pisada no mato: linhas quebradas em pixels do mundo. */
  paths?: [number, number][][];
  /** Porta na parede (tile que não é parede, mas é desenhado como porta de madeira). */
  door?: [number, number];
}

const T = TILE;

export const PAL = {
  wood0: '#2e241c',
  wood1: '#47372a',
  wood2: '#57412e',
  wood3: '#654b34',
  wood4: '#73573b',
  tile0: '#55524c',
  tile1: '#7b766a',
  tile2: '#878276',
  tile3: '#948f83',
  stain: '#675f50',
  conc0: '#313337',
  conc1: '#45433e',
  conc2: '#4e4b46',
  conc3: '#58554f',
  grass0: '#2c3420',
  grass1: '#3d4428',
  grass2: '#555c32',
  grass3: '#727243',
  dirt0: '#3f3128',
  dirt1: '#534234',
  dirt2: '#665441',
  wallTop: '#8f897e',
  wallTop2: '#7e786e',
  wallTop3: '#6d685f',
  wallFace: '#6e685d',
  wallFace2: '#5f5a51',
  wallFace3: '#514c45',
  brick: '#7a2e22',
  brick2: '#94402b',
  mortar: '#8a8477',
  ink: '#111113',
  dry0: '#5a5035',
  dry1: '#6f633f',
  dry2: '#84764b',
  grime: '#241f1a',
  paper: '#a49b86',
  glass: '#7f9196',
  rust: '#6e3d22',
  stone: '#5e5b55',
};

/** Número estável por posição: o mesmo piso toda vez, sem sortear de novo. */
export const phash = (x: number, y: number, s = 0): number => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;
type Px = (x: number, y: number, c: string) => void;

function painter(ctx: CanvasRenderingContext2D): { rect: Rect; px: Px } {
  // Tudo desenhado com WALL_H de folga em cima: (x, y) do mundo vira (x, y + WALL_H) na textura.
  const rect: Rect = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y + WALL_H, w, h);
  };
  return { rect, px: (x, y, c) => rect(x, y, 1, 1, c) };
}

/** Gera (ou refaz) as texturas `${key}-floor` e `${key}-walls`. */
export function paintHouse(scene: Phaser.Scene, key: string, plan: HousePlan): void {
  const w = plan.cols * T;
  const h = plan.rows * T + WALL_H;
  for (const k of [`${key}-floor`, `${key}-walls`]) if (scene.textures.exists(k)) scene.textures.remove(k);
  const floorTex = scene.textures.createCanvas(`${key}-floor`, w, h)!;
  const wallTex = scene.textures.createCanvas(`${key}-walls`, w, h)!;
  const fctx = floorTex.getContext();
  const wctx = wallTex.getContext();
  fctx.fillStyle = PAL.ink;
  fctx.fillRect(0, 0, w, h);
  const f = painter(fctx);
  const wl = painter(wctx);
  const wallAt = (x: number, y: number) => x < 0 || y < 0 || x >= plan.cols || y >= plan.rows || plan.isWall(x, y);
  const [dx, dy] = plan.door ?? [-1, -1];
  const isFence = (x: number, y: number) => !!plan.fence?.(x, y);
  const masonry = (x: number, y: number) => wallAt(x, y) && !isFence(x, y);

  for (let ty = 0; ty < plan.rows; ty++) {
    for (let tx = 0; tx < plan.cols; tx++) {
      const X = tx * T;
      const Y = ty * T;
      if (isFence(tx, ty)) {
        // Debaixo e além da cerca: a terra de fora, mais escura e largada.
        grass(f, X, Y, tx, ty, plan);
        f.rect(X, Y, T, T, 'rgba(12,12,16,0.28)');
        continue;
      }
      if (plan.isWall(tx, ty)) continue;
      const kind = plan.floorOf(tx, ty);
      if (kind === 'wood') wood(f, X, Y, tx, ty);
      else if (kind === 'tile') tiles(f, X, Y, tx, ty);
      else if (kind === 'concrete') concrete(f, X, Y, tx, ty);
      else grass(f, X, Y, tx, ty, plan);
    }
  }

  // Desgaste: manchas de sujeira, cacos e papel no chão de dentro de casa.
  for (let ty = 0; ty < plan.rows; ty++) {
    for (let tx = 0; tx < plan.cols; tx++) {
      if (plan.isWall(tx, ty)) continue;
      const kind = plan.floorOf(tx, ty);
      if (kind === 'grass' || kind === 'dirt') continue;
      wear(f, tx * T, ty * T, tx, ty, kind === 'wood');
    }
  }

  // Paredes laterais e a de cima jogam sombra no chão, em degraus.
  for (let ty = 0; ty < plan.rows; ty++) {
    for (let tx = 0; tx < plan.cols; tx++) {
      if (plan.isWall(tx, ty)) continue;
      const X = tx * T;
      const Y = ty * T;
      if (masonry(tx - 1, ty)) f.rect(X, Y, 3, T, 'rgba(17,17,19,0.28)');
      if (masonry(tx + 1, ty)) f.rect(X + T - 2, Y, 2, T, 'rgba(17,17,19,0.16)');
      if (masonry(tx, ty - 1)) {
        f.rect(X, Y, T, 3, 'rgba(17,17,19,0.42)');
        f.rect(X, Y + 3, T, 3, 'rgba(17,17,19,0.2)');
      }
    }
  }

  // Paredes: tampo claro de T px (começando WALL_H acima do tile) e, onde há chão embaixo, a face.
  for (let ty = 0; ty < plan.rows; ty++) {
    for (let tx = 0; tx < plan.cols; tx++) {
      if (!plan.isWall(tx, ty)) continue;
      if (isFence(tx, ty)) {
        fence(wl, tx, ty, !wallAt(tx, ty + 1), isFence(tx, ty - 1) || isFence(tx, ty + 1));
        continue;
      }
      const { rect, px } = wl;
      const X = tx * T;
      const top = ty * T - WALL_H;
      const face = !wallAt(tx, ty + 1) || (tx === dx && ty + 1 === dy);
      rect(X, top, T, T, PAL.wallTop);
      for (let i = 0; i < 9; i++) {
        px(X + Math.floor(phash(tx, ty, 200 + i) * T), top + Math.floor(phash(ty, tx, 200 + i) * T), i % 4 ? PAL.wallTop2 : PAL.wallTop3);
      }
      // Quinas: borda mais escura onde a parede termina.
      if (!wallAt(tx - 1, ty)) rect(X, top, 2, T, PAL.wallTop2);
      if (!wallAt(tx + 1, ty)) rect(X + T - 2, top, 2, T, PAL.wallTop3);
      if (!wallAt(tx, ty - 1)) rect(X, top, T, 2, PAL.wallTop2);
      if (phash(tx, ty, 260) < 0.22) {
        // Rachadura no reboco do topo.
        let cx = X + 3 + Math.floor(phash(tx, ty, 261) * 20);
        let cy = top + 3 + Math.floor(phash(tx, ty, 262) * 8);
        for (let i = 0; i < 10; i++) {
          px(cx, cy, PAL.wallTop3);
          cy++;
          if (phash(cx, cy, 263) < 0.4) cx += phash(cy, cx, 264) < 0.5 ? -1 : 1;
        }
      }
      if (face) wallFace(wl, X, top + T, tx, ty);
    }
  }

  if (plan.door) {
    // Porta de madeira na parede de baixo: tampo de parede com o vão escuro e a folha na face.
    const { rect, px } = wl;
    const X = dx * T;
    const top = dy * T - WALL_H;
    rect(X, top, T, T, PAL.wallTop);
    rect(X, top, T, 2, PAL.wallTop2);
    rect(X + 3, top + 6, T - 6, T - 6, PAL.ink);
    const fy = top + 8;
    rect(X + 4, fy, T - 8, T + WALL_H - 8, PAL.wood2);
    for (let i = 0; i < 4; i++) rect(X + 4 + i * 5, fy, 1, T + WALL_H - 8, PAL.wood0);
    rect(X + 4, fy + 6, T - 8, 2, PAL.wood1);
    rect(X + 4, fy + T - 2, T - 8, 2, PAL.wood1);
    rect(X + 4, fy, T - 8, 1, PAL.wood4);
    px(X + T - 8, fy + 15, '#d9b45b');
    px(X + T - 8, fy + 16, '#8a6d2f');
  }

  floorTex.refresh();
  wallTex.refresh();
}

function wallFace({ rect }: { rect: Rect }, X: number, Y: number, tx: number, ty: number): void {
  // Face de WALL_H px: reboco sujo, faixa clara em cima, rodapé escuro e tijolo aparecendo aqui e ali.
  rect(X, Y, T, WALL_H, PAL.wallFace);
  rect(X, Y, T, 2, PAL.wallTop3);
  rect(X, Y + 7, T, 1, PAL.wallFace2);
  for (let i = 0; i < 3; i++) {
    const sx = X + Math.floor(phash(tx, ty, 220 + i) * T);
    rect(sx, Y + 2 + Math.floor(phash(tx, ty, 230 + i) * 3), 1, 2 + Math.floor(phash(ty, tx, 240 + i) * 4), PAL.wallFace2);
  }
  if (phash(tx, ty, 300) < 0.15) {
    const bx = X + 3 + Math.floor(phash(tx, ty, 301) * 11);
    rect(bx - 1, Y + 3, 13, 8, PAL.wallFace3);
    rect(bx, Y + 4, 5, 3, PAL.brick2);
    rect(bx + 6, Y + 4, 5, 3, PAL.brick);
    rect(bx + 2, Y + 8, 7, 2, PAL.brick);
    rect(bx, Y + 7, 11, 1, PAL.mortar);
  }
  // Umidade subindo do rodapé e escorridos de sujeira.
  for (let x = 0; x < T; x++) {
    const hgt = 1 + Math.floor(phash(X + x, ty, 270) * 3);
    rect(X + x, Y + WALL_H - 2 - hgt, 1, hgt, PAL.wallFace3);
  }
  if (phash(tx, ty, 280) < 0.4) rect(X + Math.floor(phash(tx, ty, 281) * 26), Y + 2, 1, 6 + Math.floor(phash(tx, ty, 282) * 5), PAL.grime);
  rect(X, Y + WALL_H - 2, T, 2, PAL.wood0);
}

/** Sujeira, cacos de vidro e papel velho espalhados, sem exagero. */
function wear({ rect, px }: { rect: Rect; px: Px }, X: number, Y: number, tx: number, ty: number, wood: boolean): void {
  if (wood && phash(tx, ty, 480) < 0.035) {
    // Tábua quebrada: um pedaço faltando, com o vão escuro e a ponta lascada.
    const x = X + 4 + Math.floor(phash(tx, ty, 481) * 12);
    const y = Y + 7 * Math.floor(phash(tx, ty, 482) * 4);
    rect(x, y + 1, 10, 5, PAL.ink);
    rect(x, y + 1, 10, 1, PAL.grime);
    px(x + 10, y + 2, PAL.wood1);
    px(x - 1, y + 4, PAL.wood1);
  }
  if (phash(tx, ty, 400) < 0.12) {
    // Mancha irregular: pontos em volta de um centro, mais densos no meio.
    const cx = X + 6 + Math.floor(phash(tx, ty, 401) * 16);
    const cy = Y + 6 + Math.floor(phash(tx, ty, 402) * 16);
    for (let i = 0; i < 40; i++) {
      const a = phash(tx, ty, 410 + i) * Math.PI * 2;
      const r = Math.sqrt(phash(ty, tx, 410 + i)) * 7;
      px(cx + Math.round(Math.cos(a) * r * 1.3), cy + Math.round(Math.sin(a) * r * 0.8), 'rgba(20,17,14,0.35)');
    }
  }
  if (phash(tx, ty, 450) < 0.3) {
    for (let i = 0; i < 3; i++) {
      const x = X + Math.floor(phash(tx, ty, 451 + i) * 26);
      const y = Y + Math.floor(phash(ty, tx, 451 + i) * 26);
      const k = phash(tx, ty, 460 + i);
      if (k < 0.35) px(x, y, PAL.glass);
      else if (k < 0.6) rect(x, y, 2, 1, PAL.paper);
      else px(x, y, PAL.grime);
    }
  }
  if (phash(tx, ty, 470) < 0.05) {
    // Folha de papel amassada.
    const x = X + 6 + Math.floor(phash(tx, ty, 471) * 14);
    const y = Y + 8 + Math.floor(phash(tx, ty, 472) * 12);
    rect(x, y, 4, 3, PAL.paper);
    px(x + 1, y + 1, PAL.stain);
    px(x + 3, y, PAL.tile1);
  }
}

function wood({ rect, px }: { rect: Rect; px: Px }, X: number, Y: number, tx: number, ty: number): void {
  // Tábuas de 7 px com emendas desencontradas, veios, nós e brilho de desgaste.
  for (let p = 0; p < 4; p++) {
    const py = Y + p * 7;
    const row = ty * 4 + p;
    rect(X, py, T, 7, [PAL.wood2, PAL.wood1, PAL.wood3, PAL.wood2][Math.floor(phash(tx, row) * 4)]);
    rect(X, py + 6, T, 1, PAL.wood0);
    rect(X, py, T, 1, PAL.wood3);
    const off = Math.floor(phash(row, 7) * 42);
    for (let gx = X; gx < X + T; gx++) {
      if ((gx + off) % 42 === 0) {
        rect(gx, py, 1, 6, PAL.wood0);
        rect(gx + 1, py + 1, 1, 5, PAL.wood4);
      }
    }
    for (let i = 0; i < 2; i++) {
      rect(X + Math.floor(phash(tx, row, 10 + i) * 21), py + 3 + (i % 2), 3 + Math.floor(phash(tx, row, 20 + i) * 5), 1, PAL.wood1);
    }
    if (phash(tx, row, 3) < 0.13) {
      const kx = X + 4 + Math.floor(phash(tx, row, 4) * 19);
      rect(kx, py + 2, 3, 2, PAL.wood0);
      px(kx + 1, py + 1, PAL.wood1);
    }
    if (phash(tx, row, 5) < 0.28) rect(X + Math.floor(phash(tx, row, 6) * 22), py + 2, 5, 1, PAL.wood4);
  }
}

function tiles({ rect, px }: { rect: Rect; px: Px }, X: number, Y: number, tx: number, ty: number): void {
  // Azulejo 14×14 com rejunte, chanfro claro, trincas e manchas.
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const x0 = X + sx * 14;
      const y0 = Y + sy * 14;
      rect(x0, y0, 14, 14, phash(tx * 2 + sx, ty * 2 + sy) < 0.25 ? PAL.tile1 : PAL.tile2);
      rect(x0 + 1, y0 + 1, 12, 1, PAL.tile3);
      rect(x0 + 1, y0 + 1, 1, 12, PAL.tile3);
      rect(x0, y0 + 13, 14, 1, PAL.tile0);
      rect(x0 + 13, y0, 1, 14, PAL.tile0);
      if (phash(x0, y0, 5) < 0.16) {
        let cx = x0 + 2;
        let cy = y0 + 2 + Math.floor(phash(x0, y0, 6) * 7);
        for (let i = 0; i < 9; i++) {
          px(cx, cy, PAL.tile0);
          cx++;
          if (phash(cx, cy, 2) < 0.45) cy++;
        }
      }
      if (phash(x0, y0, 8) < 0.14) {
        rect(x0 + 4, y0 + 5, 5, 3, PAL.stain);
        rect(x0 + 5, y0 + 4, 3, 5, PAL.stain);
      }
    }
  }
}

function concrete({ rect, px }: { rect: Rect; px: Px }, X: number, Y: number, tx: number, ty: number): void {
  rect(X, Y, T, T, PAL.conc1);
  for (let i = 0; i < 38; i++) {
    px(X + Math.floor(phash(tx, ty, i) * T), Y + Math.floor(phash(ty, tx, i) * T), i % 3 === 0 ? PAL.conc0 : i % 3 === 1 ? PAL.conc2 : PAL.conc3);
  }
  // Junta de dilatação a cada 2 casas e manchas de óleo.
  if (tx % 2 === 0) rect(X, Y, 1, T, PAL.conc0);
  if (ty % 2 === 0) rect(X, Y, T, 1, PAL.conc0);
  if (phash(tx, ty, 77) < 0.14) {
    for (let i = 0; i < 22; i++) {
      const a = phash(tx, ty, 80 + i) * Math.PI * 2;
      const r = phash(ty, tx, 80 + i) * 5;
      px(X + 14 + Math.round(Math.cos(a) * r * 1.4), Y + 14 + Math.round(Math.sin(a) * r * 0.8), PAL.conc0);
    }
  }
}

/** Ruído suave (interpolado entre pontos de uma grade de `cell` px): dá manchas orgânicas, não blocos. */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = phash(gx, gy, seed);
  const b = phash(gx + 1, gy, seed);
  const c = phash(gx, gy + 1, seed);
  const d = phash(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Distância de um ponto até uma linha quebrada. */
function distToPath(x: number, y: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * Quintal abandonado: terra seca com touceiras de capim (manchas suaves, borda pontilhada em vez de
 * degrau), mato mais alto encostado nas paredes, trilhas pisadas e pouco entulho.
 */
function grass({ rect, px }: { rect: Rect; px: Px }, X: number, Y: number, tx: number, ty: number, plan: HousePlan): void {
  const wallNear = (x: number, y: number) => plan.isWall(Math.floor(x / T), Math.floor(y / T));
  for (let y = Y; y < Y + T; y++) {
    for (let x = X; x < X + T; x++) {
      let n = vnoise(x, y, 26, 500) * 0.7 + vnoise(x, y, 9, 501) * 0.3;
      // Junto da parede ninguém pisa: o mato cresce.
      if (wallNear(x - 10, y) || wallNear(x + 10, y) || wallNear(x, y - 12) || wallNear(x, y + 10)) n += 0.14;
      let path = Infinity;
      for (const p of plan.paths ?? []) path = Math.min(path, distToPath(x, y, p));
      const wob = vnoise(x, y, 5, 502) * 4;
      const dither = BAYER4[(y & 3) * 4 + (x & 3)];
      let c: string;
      if (path < 5 + wob) c = path < 2.5 + wob * 0.5 && dither < 0.3 ? PAL.dirt2 : PAL.dirt1;
      else if (path < 7 + wob) c = dither < 0.5 ? PAL.dirt1 : PAL.dry0;
      else if (n < 0.42) c = PAL.dirt1;
      else if (n < 0.47) c = dither < (n - 0.42) / 0.05 ? PAL.dry0 : PAL.dirt1;
      else if (n < 0.6) c = PAL.dry0;
      else if (n < 0.66) c = dither < (n - 0.6) / 0.06 ? PAL.grass1 : PAL.dry0;
      else c = PAL.grass1;
      px(x, y, c);
    }
  }
  // Terra: torrões e pedrisco.
  for (let i = 0; i < 18; i++) {
    px(X + Math.floor(phash(tx, ty, 60 + i) * T), Y + Math.floor(phash(ty, tx, 60 + i) * T), i % 3 ? PAL.dirt0 : PAL.dirt2);
  }
  // Tufos só onde há capim (não no meio da trilha): a maioria seca.
  for (let i = 0; i < 26; i++) {
    const sx = X + Math.floor(phash(tx, ty, 100 + i) * T);
    const sy = Y + 2 + Math.floor(phash(ty, tx, 100 + i) * (T - 3));
    const n = vnoise(sx, sy, 26, 500) * 0.7 + vnoise(sx, sy, 9, 501) * 0.3;
    let path = Infinity;
    for (const p of plan.paths ?? []) path = Math.min(path, distToPath(sx, sy, p));
    if (n < 0.5 || path < 8) continue;
    const green = n > 0.66 && phash(tx, ty, 130 + i) < 0.5;
    px(sx, sy, PAL.grass0);
    px(sx, sy - 1, green ? PAL.grass2 : PAL.dry1);
    px(sx, sy - 2, green ? PAL.grass3 : PAL.dry2);
    if (n > 0.62) {
      px(sx + 1, sy - 1, green ? PAL.grass2 : PAL.dry1);
      px(sx - 1, sy, PAL.grass0);
    }
  }
  let path = Infinity;
  for (const p of plan.paths ?? []) path = Math.min(path, distToPath(X + 14, Y + 14, p));
  if (path < 16) return;
  const k = phash(tx, ty, 600);
  if (k < 0.12) {
    // Pedras.
    for (let i = 0; i < 2; i++) {
      const x = X + 3 + Math.floor(phash(tx, ty, 601 + i) * 20);
      const y = Y + 3 + Math.floor(phash(tx, ty, 603 + i) * 20);
      rect(x, y, 3, 2, PAL.stone);
      rect(x, y + 2, 3, 1, PAL.ink);
      px(x, y, PAL.conc3);
    }
  } else if (k < 0.16) {
    // Tábua velha largada, com prego enferrujado.
    const x = X + 2 + Math.floor(phash(tx, ty, 610) * 8);
    const y = Y + 6 + Math.floor(phash(tx, ty, 611) * 14);
    rect(x, y, 16, 3, PAL.wood2);
    rect(x, y + 3, 16, 1, 'rgba(17,17,19,0.6)');
    rect(x, y, 16, 1, PAL.wood3);
    px(x + 3, y + 1, PAL.rust);
    px(x + 12, y + 1, PAL.rust);
  } else if (k < 0.18) {
    // Pneu velho meio enterrado.
    const x = X + 6 + Math.floor(phash(tx, ty, 620) * 8);
    const y = Y + 8 + Math.floor(phash(tx, ty, 621) * 8);
    rect(x + 1, y + 7, 12, 2, 'rgba(17,17,19,0.45)');
    rect(x + 2, y, 8, 8, '#1b1b1d');
    rect(x, y + 2, 12, 4, '#1b1b1d');
    rect(x + 1, y + 1, 10, 6, '#1b1b1d');
    rect(x + 4, y + 3, 4, 2, PAL.dirt0);
    rect(x + 3, y + 1, 5, 1, '#3a3a3e');
  } else if (k < 0.22) {
    // Lata enferrujada.
    const x = X + 4 + Math.floor(phash(tx, ty, 630) * 18);
    const y = Y + 4 + Math.floor(phash(tx, ty, 631) * 18);
    rect(x, y, 3, 2, PAL.rust);
    px(x, y, PAL.dry2);
  }
}

/**
 * Sombra pela área que o móvel ocupa no chão: retângulo de cantos cortados, da largura da parte de
 * baixo do objeto e com a profundidade do tampo, 2 px para a direita e 1 para baixo (luz do alto à
 * esquerda). Dois tons. Desenhar com origem (0, 0) em (esquerda − 1, base − altura da imagem).
 */
export function footShadow(scene: Phaser.Scene, key: string, depthFrac = 0.34): string {
  const id = `shadow-${key}`;
  if (scene.textures.exists(id)) return id;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
  const w = src.width;
  const h = src.height;
  const depth = Math.max(6, Math.round(h * depthFrac));
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
  const tex = scene.textures.createCanvas(id, w + 6, h + 4)!;
  const ctx = tex.getContext();
  const top = bottom - depth + 1;
  for (let y = top; y <= bottom + 2; y++) {
    for (let x = x0; x <= x1 + 2; x++) {
      const edge = y === top || y === bottom + 2 || x === x0 || x === x1 + 2;
      const corner = (y === top || y === bottom + 2) && (x === x0 || x === x1 + 2);
      if (corner) continue;
      ctx.fillStyle = edge ? 'rgba(17,17,19,0.22)' : 'rgba(17,17,19,0.45)';
      ctx.fillRect(x + 3, y + 1, 1, 1);
    }
  }
  tex.refresh();
  return id;
}

/**
 * Cerca velha de madeira na borda do quintal. Na lateral (vista de cima) é uma linha de tábuas com
 * mourões, aqui e ali quebrada ou remendada com chapa; embaixo (vista de frente) é uma fileira de
 * estacas de alturas diferentes, com frestas mostrando a terra de fora.
 */
function fence({ rect, px }: { rect: Rect; px: Px }, tx: number, ty: number, front: boolean, vertical: boolean): void {
  const X = tx * T;
  const top = ty * T - WALL_H;
  const shade = 'rgba(17,17,19,0.4)';
  if (vertical && !front) {
    const k = phash(tx, ty, 700);
    const x = X + 5;
    if (k < 0.22) {
      // Remendo de chapa de metal ondulada, com ferrugem.
      rect(x - 1, top, 6, T, '#55595c');
      for (let y = top; y < top + T; y += 3) rect(x - 1, y, 6, 1, '#6e7376');
      rect(x + 5, top, 1, T, PAL.ink);
      rect(x + 6, top, 2, T, shade);
      for (let i = 0; i < 4; i++) px(x + Math.floor(phash(tx, ty, 710 + i) * 5), top + Math.floor(phash(ty, tx, 710 + i) * T), PAL.rust);
    } else {
      const gap = k < 0.36 ? top + 8 + Math.floor(phash(tx, ty, 720) * 8) : -1;
      for (let y = top; y < top + T; y++) {
        if (gap >= 0 && y >= gap && y < gap + 9) continue;
        rect(x, y, 4, 1, PAL.wood2);
        px(x, y, PAL.wood3);
        px(x + 3, y, PAL.wood0);
        rect(x + 4, y, 2, 1, shade);
      }
      for (let i = 0; i < 4; i++) px(x + 1 + (i % 2), top + 3 + Math.floor(phash(tx, ty, 730 + i) * (T - 6)), PAL.wood1);
      if (gap >= 0) {
        // A tábua que caiu, largada do lado de fora.
        rect(x + 8, gap + 2, 3, 11, PAL.wood1);
        px(x + 9, gap + 4, PAL.rust);
        rect(x + 11, gap + 3, 1, 10, shade);
      }
    }
    // Mourão.
    rect(x - 1, top + T - 6, 6, 6, PAL.wood1);
    rect(x - 1, top + T - 6, 6, 1, PAL.wood3);
    rect(x + 5, top + T - 5, 2, 5, shade);
    return;
  }
  // De frente: travessas atrás e estacas na frente, terminando na base do tile.
  const base = ty * T + T;
  rect(X, base - 22, T, 3, PAL.wood1);
  rect(X, base - 10, T, 3, PAL.wood1);
  for (let i = 0; i < 6; i++) {
    const x = X + i * 5;
    if (x + 4 > X + T) break;
    const broken = phash(tx * 7 + i, ty, 740) < 0.18;
    const missing = phash(tx * 7 + i, ty, 741) < 0.08;
    if (missing) continue;
    const h = broken ? 14 + Math.floor(phash(tx * 7 + i, ty, 742) * 6) : 28 + Math.floor(phash(tx * 7 + i, ty, 743) * 3);
    const y0 = base - h;
    rect(x, y0 + 1, 4, h - 1, PAL.wood2);
    rect(x, y0 + 1, 1, h - 1, PAL.wood3);
    rect(x + 3, y0 + 1, 1, h - 1, PAL.wood0);
    if (!broken) {
      px(x + 1, y0, PAL.wood3);
      px(x + 2, y0, PAL.wood2);
    }
    else px(x + 1, y0 + 1, PAL.wood0);
    px(x + 1, base - 21, PAL.rust);
    px(x + 1, base - 9, PAL.rust);
    rect(x, base - 3, 4, 3, PAL.wood0);
  }
}

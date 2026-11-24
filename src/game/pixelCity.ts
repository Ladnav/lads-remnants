import Phaser from 'phaser';
import { TILE, WALL_H } from './oblique';
import { PAL, painter, phash, vnoise, type Px, type Rect } from './pixelHouse';

/**
 * Mapa da cidade em pixel art, desenhado por código numa textura só (fica parado; quem anda por cima
 * são as expedições). Grade: quarteirões de 4×3 tiles, ruas nas colunas x % 5 == 4 e nas linhas
 * y % 4 == 3, e um rio no lugar da avenida da coluna 14, com pontes nas ruas.
 */

const T = TILE;
export const CITY_W = 28;
export const CITY_H = 20;
export const RIVER_X = 14;

export const isStreet = (x: number, y: number): boolean => x % 5 === 4 || y % 4 === 3;

export type LandmarkKind = 'market' | 'garage' | 'pharmacy' | 'hospital' | 'police' | 'shelter';

/** Prédio especial: retângulo no chão (em tiles, pode ser fracionado) e o tipo. */
export interface Landmark {
  kind: LandmarkKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Onde fica cada prédio especial, sempre dentro de um quarteirão e de frente para a rua de baixo. */
export const LANDMARKS: Landmark[] = [
  { kind: 'market', x: 10, y: 8.4, w: 3.8, h: 2.6 },
  { kind: 'garage', x: 5.2, y: 4.3, w: 3.6, h: 2.7 },
  { kind: 'pharmacy', x: 15.6, y: 8.6, w: 2.8, h: 2.4 },
  { kind: 'hospital', x: 20, y: 4, w: 4, h: 3 },
  { kind: 'police', x: 20.3, y: 12.3, w: 3.5, h: 2.7 },
  { kind: 'shelter', x: 5, y: 12, w: 4, h: 3 },
];

const C = {
  asphalt: '#2c2d30',
  asphalt2: '#343539',
  asphalt3: '#242528',
  lane: '#6d6650',
  curb: '#55524c',
  curb2: '#68655e',
  walk: '#4a4843',
  water: '#1d3533',
  water2: '#28463f',
  water3: '#33574d',
  reed: '#4a5a2b',
  tile: '#7c4330',
  tile2: '#633526',
  tile3: '#93523a',
  flat: '#62605a',
  flat2: '#55534e',
  flat3: '#706d66',
  metal: '#59636a',
  metal2: '#48525a',
  tank: '#3a6a96',
  tank2: '#5585b4',
  leaf: '#2f4423',
  leaf2: '#3f5a2c',
  leaf3: '#57733a',
  win: '#1b1d22',
  shadow: 'rgba(12,12,16,0.45)',
};
const WALLS = ['#857b6a', '#7a8580', '#8f7d64', '#7d7468', '#8a8173', '#6f7a72'];
const CARS = ['#6b3a32', '#4a5560', '#6a6452', '#3f4f44', '#56443a', '#4a4a52', '#5a3f3a', '#7a7a76'];

/** Gera a textura `${key}` com a cidade inteira (começando WALL_H acima da primeira linha). */
export function paintCity(scene: Phaser.Scene, key: string): void {
  const w = CITY_W * T;
  const h = CITY_H * T + WALL_H;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, 0, w, h);
  const p = painter(ctx);
  // Faixa acima da primeira linha: continua o chão.
  for (let x = 0; x < CITY_W; x++) lot(p, x * T, -WALL_H, T, WALL_H, x, -1);

  for (let ty = 0; ty < CITY_H; ty++) {
    for (let tx = 0; tx < CITY_W; tx++) {
      if (tx === RIVER_X) river(p, tx, ty);
      else if (isStreet(tx, ty)) street(p, tx, ty);
      else lot(p, tx * T, ty * T, T, T, tx, ty);
    }
  }
  for (let ty = 3; ty < CITY_H; ty += 4) bridge(p, ty);

  // Quarteirões: meio-fio e, em cada lote livre, uma construção (ou um terreno baldio).
  for (let by = 0; by < CITY_H; by += 4) {
    for (let bx = 0; bx < CITY_W; bx += 5) {
      const bw = Math.min(4, CITY_W - bx);
      const bh = Math.min(3, CITY_H - by);
      curb(p, bx * T, by * T, bw * T, bh * T);
      block(p, bx, by, bw, bh);
    }
  }
  for (const l of LANDMARKS) landmark(p, l);
  streetLife(p);
  cars(p);
  tex.refresh();
}

// ---------------- Chão ----------------

function street({ rect, px }: { rect: Rect; px: Px }, tx: number, ty: number): void {
  const X = tx * T;
  const Y = ty * T;
  rect(X, Y, T, T, C.asphalt);
  for (let i = 0; i < 30; i++) {
    px(X + Math.floor(phash(tx, ty, 800 + i) * T), Y + Math.floor(phash(ty, tx, 800 + i) * T), i % 2 ? C.asphalt2 : C.asphalt3);
  }
  const horiz = ty % 4 === 3;
  const vert = tx % 5 === 4;
  // Faixa central apagada (não no cruzamento).
  if (horiz && !vert) for (let x = 0; x < T; x += 12) if (phash(tx * 3 + x, ty, 810) > 0.25) rect(X + x, Y + 13, 6, 2, C.lane);
  if (vert && !horiz) for (let y = 0; y < T; y += 12) if (phash(tx, ty * 3 + y, 811) > 0.25) rect(X + 13, Y + y, 2, 6, C.lane);
  if (phash(tx, ty, 820) < 0.2) {
    // Rachadura (só um pouco mais escura que o asfalto).
    let cx = X + Math.floor(phash(tx, ty, 821) * T);
    let cy = Y + Math.floor(phash(tx, ty, 822) * 8);
    for (let i = 0; i < 12; i++) {
      px(cx, cy, '#1f2022');
      cy++;
      if (phash(cx, cy, 823) < 0.45) cx += phash(cy, cx, 824) < 0.5 ? -1 : 1;
    }
  }
  if (phash(tx, ty, 830) < 0.15) {
    // Buraco com borda clara.
    const x = X + 6 + Math.floor(phash(tx, ty, 831) * 12);
    const y = Y + 6 + Math.floor(phash(tx, ty, 832) * 12);
    rect(x, y, 7, 4, PAL.ink);
    rect(x + 1, y - 1, 5, 1, C.asphalt3);
    rect(x + 1, y + 4, 5, 1, C.asphalt2);
  }
  if (phash(tx, ty, 840) < 0.2) {
    // Mato brotando no asfalto.
    const x = X + Math.floor(phash(tx, ty, 841) * 24);
    const y = Y + 2 + Math.floor(phash(tx, ty, 842) * 22);
    px(x, y, C.leaf3);
    px(x + 1, y + 1, C.leaf2);
    px(x - 1, y + 1, C.leaf2);
  }
}

function river({ rect, px }: { rect: Rect; px: Px }, tx: number, ty: number): void {
  const X = tx * T;
  const Y = ty * T;
  rect(X, Y, T, T, PAL.dirt0);
  rect(X + 5, Y, T - 10, T, C.water);
  for (let i = 0; i < 6; i++) {
    const x = X + 7 + Math.floor(phash(tx, ty, 850 + i) * 12);
    rect(x, Y + Math.floor(phash(ty, tx, 850 + i) * T), 3 + (i % 3), 1, i % 2 ? C.water2 : C.water3);
  }
  // Barranco com mato.
  for (let y = 0; y < T; y++) {
    if (phash(tx, ty * T + y, 860) < 0.45) px(X + 4, Y + y, C.reed);
    if (phash(tx, ty * T + y, 861) < 0.45) px(X + T - 5, Y + y, C.reed);
    if (phash(tx, ty * T + y, 862) < 0.2) px(X + 3, Y + y, C.leaf3);
  }
  rect(X + 5, Y, 1, T, PAL.ink);
}

function bridge({ rect, px }: { rect: Rect; px: Px }, ty: number): void {
  const X = RIVER_X * T - 4;
  const Y = ty * T + 3;
  const w = T + 8;
  rect(X, Y + 2, w, T - 6, '#4f4c46');
  for (let i = 0; i < 14; i++) px(X + Math.floor(phash(ty, i, 870) * w), Y + 3 + Math.floor(phash(i, ty, 870) * (T - 9)), i % 2 ? '#58554f' : '#46433e');
  rect(X, Y, w, 2, '#7b766c');
  rect(X, Y + T - 6, w, 2, '#7b766c');
  rect(X, Y + T - 4, w, 2, C.shadow);
  // Guarda-corpo com um trecho caído.
  for (let x = X; x < X + w; x += 4) {
    if (phash(x, ty, 871) < 0.15) continue;
    px(x, Y - 1, '#8d877c');
  }
}

/** Chão de lote: terra e mato ralo, com manchas suaves. */
function lot({ px }: { rect: Rect; px: Px }, X: number, Y: number, w: number, h: number, tx: number, ty: number): void {
  for (let y = Y; y < Y + h; y++) {
    for (let x = X; x < X + w; x++) {
      const n = vnoise(x, y, 20, 880) * 0.7 + vnoise(x, y, 7, 881) * 0.3;
      px(x, y, n < 0.42 ? PAL.dirt0 : n < 0.58 ? PAL.dry0 : PAL.grass1);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = X + Math.floor(phash(tx, ty, 890 + i) * w);
    const y = Y + Math.floor(phash(ty, tx, 890 + i) * h);
    px(x, y, i % 2 ? PAL.dry2 : PAL.grass2);
  }
}

function curb({ rect }: { rect: Rect; px: Px }, X: number, Y: number, w: number, h: number): void {
  // Calçada estreita com meio-fio claro em volta do quarteirão.
  rect(X, Y, w, 3, C.walk);
  rect(X, Y + h - 3, w, 3, C.walk);
  rect(X, Y, 3, h, C.walk);
  rect(X + w - 3, Y, 3, h, C.walk);
  rect(X, Y, w, 1, C.curb2);
  rect(X, Y, 1, h, C.curb2);
  rect(X, Y + h - 1, w, 1, C.curb);
  rect(X + w - 1, Y, 1, h, C.curb);
}

// ---------------- Construções ----------------

const inLandmark = (x: number, y: number, w: number, h: number): boolean =>
  LANDMARKS.some((l) => x < (l.x + l.w) * T && x + w > l.x * T && y < (l.y + l.h) * T && y + h > l.y * T);

/** Um quarteirão: 2×2 lotes, cada um com casa, prédio baixo, ruína ou terreno baldio, e árvores. */
function block(p: { rect: Rect; px: Px }, bx: number, by: number, bw: number, bh: number): void {
  const X = bx * T + 4;
  const Y = by * T + 4;
  const W = bw * T - 8;
  const H = bh * T - 8;
  const cols = bw >= 4 ? 2 : 1;
  const kind = phash(bx, by, 905);
  if (!inLandmark(X, Y, W, H) && bw >= 4) {
    if (kind < 0.1) return square(p, X, Y, W, H, bx, by);
    if (kind < 0.22) {
      // Prédio baixo de apartamentos ocupando o quarteirão.
      house(p, X + 4, Y + 14, W - 10, H - 18, 'flat', bx * 31 + by);
      roofDetails(p, X + 5, Y + 6, W - 12, H - 20, bx * 31 + by, false);
      return;
    }
  }
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < cols; i++) {
      const lx = X + Math.floor((W * i) / cols);
      const ly = Y + Math.floor((H * j) / 2);
      const lw = Math.floor(W / cols);
      const lh = Math.floor(H / 2);
      if (inLandmark(lx, ly, lw, lh)) continue;
      const k = phash(bx * 2 + i, by * 2 + j, 900);
      if (k < 0.14) {
        // Terreno baldio com entulho e uma árvore.
        rubble(p, lx + 4, ly + lh - 10, bx + i, by + j);
        tree(p, lx + 6 + Math.floor(phash(bx, by + j, 901) * (lw - 16)), ly + 4, bx + i, by + j);
        continue;
      }
      // Casa: ocupa quase todo o lote, recuada do fundo; o resto é quintal com muro.
      const hw = lw - 6 - Math.floor(phash(bx + i, by + j, 902) * 10);
      const hx = lx + 2 + Math.floor(phash(bx + i, by + j, 903) * (lw - hw - 3));
      const hd = lh - 6;
      const roof = k < 0.55 ? 'tile' : k < 0.8 ? 'flat' : k < 0.93 ? 'metal' : 'ruin';
      wallFence(p, lx, ly, lw, lh, bx + i, by + j);
      house(p, hx, ly + 9, hw, hd - 7, roof, bx * 7 + i + (by + j) * 13);
      if (phash(bx + i, by + j, 904) < 0.35) tree(p, lx + (hx - lx > 10 ? 2 : lw - 12), ly + lh - 14, bx + i, by + j);
    }
  }
}

/** Muro baixo nos fundos e nas laterais do lote (a frente fica aberta). */
function wallFence({ rect }: { rect: Rect; px: Px }, x: number, y: number, w: number, h: number, sx: number, sy: number): void {
  const c = phash(sx, sy, 910) < 0.5 ? '#6e685d' : '#5f5a51';
  rect(x, y, w, 2, c);
  rect(x, y, 1, h - 2, c);
  rect(x + w - 1, y, 1, h - 2, c);
  // Um trecho caído.
  if (phash(sx, sy, 911) < 0.4) rect(x + 4 + Math.floor(phash(sx, sy, 912) * (w - 12)), y, 6, 2, PAL.dirt0);
}

/**
 * Casa vista em 3/4: telhado (x, y-alt, w, d) e a fachada logo abaixo. `seed` decide cores,
 * janelas tábuas e estragos.
 */
function house({ rect, px }: { rect: Rect; px: Px }, x: number, y: number, w: number, d: number, roof: string, seed: number): void {
  const alt = 9;
  const face = WALLS[Math.floor(phash(seed, 1, 920) * WALLS.length)];
  const top = y - alt;
  const eave = roof === 'tile' || roof === 'metal' ? 1 : 0;
  // Sombra no chão para a direita e embaixo (luz do alto à esquerda).
  rect(x + w + eave + 1, top + 3, 3, d + alt - 2, C.shadow);
  rect(x + 2, y + d + 1, w + eave, 2, C.shadow);
  // Fachada: parede, rodapé, janelas com batente e peitoril, porta com degrau.
  rect(x, y + d - alt, w, alt, face);
  rect(x, y + d - 2, w, 2, PAL.wallFace3);
  const n = Math.max(1, Math.floor((w - 4) / 8));
  const door = Math.floor(phash(seed, 2, 921) * n);
  for (let i = 0; i < n; i++) {
    const wx = x + 3 + i * 8;
    if (i === door) {
      rect(wx - 1, y + d - 8, 6, 8, PAL.wallFace3);
      rect(wx, y + d - 7, 4, 7, '#3b2a1f');
      px(wx + 3, y + d - 4, '#b08a3a');
      rect(wx - 1, y + d, 6, 1, '#8a8477');
      continue;
    }
    rect(wx - 1, y + d - 8, 6, 5, PAL.wallFace3);
    rect(wx, y + d - 7, 4, 3, C.win);
    px(wx, y + d - 7, '#3a4048');
    rect(wx - 1, y + d - 3, 6, 1, '#a39c8d');
    if (phash(seed, i, 922) < 0.4) rect(wx - 1, y + d - 6, 6, 1, PAL.wood2); // tábua pregada
    else if (phash(seed, i, 931) < 0.25) px(wx + 2, y + d - 6, '#7f9196'); // vidro quebrado
  }
  if (w > 26 && phash(seed, 6, 932) < 0.35) {
    // Ar-condicionado pendurado, pingando ferrugem.
    const ax = x + w - 8;
    rect(ax, y + d - 8, 5, 3, '#9a948a');
    rect(ax, y + d - 6, 5, 1, '#6e685d');
    px(ax + 2, y + d - 4, PAL.rust);
  }
  if (phash(seed, 3, 923) < 0.22) {
    // Pichação.
    const gx = x + 2 + Math.floor(phash(seed, 4, 924) * Math.max(1, w - 10));
    for (let i = 0; i < 7; i++) px(gx + i, y + d - 3 - (i % 2), i % 3 ? '#8f3324' : '#3f6f8f');
  }
  // Telhado.
  if (roof === 'tile') {
    rect(x - 1, top, w + 2, d, C.tile);
    // Fileiras de telha com a ponta clara de cada uma.
    for (let r = top + 2; r < top + d; r += 3) {
      rect(x - 1, r, w + 2, 1, C.tile2);
      for (let c = x + ((r >> 1) % 2) * 2; c < x + w; c += 4) px(c, r - 1, C.tile3);
    }
    const ridge = top + Math.floor(d / 2);
    rect(x - 1, ridge, w + 2, 1, '#a8603f');
    rect(x - 1, ridge + 1, w + 2, 1, '#4f281c');
    rect(x - 1, top, w + 2, 1, C.tile3);
    for (let i = 0; i < 4; i++) {
      if (phash(seed, i, 925) < 0.3) rect(x + 2 + Math.floor(phash(seed, i, 926) * (w - 6)), top + 2 + Math.floor(phash(i, seed, 926) * (d - 4)), 3, 2, '#2a1a14');
    }
    if (phash(seed, 7, 933) < 0.45) {
      // Chaminé de tijolo.
      const cx = x + 4 + Math.floor(phash(seed, 8, 934) * Math.max(1, w - 12));
      rect(cx + 4, ridge - 3, 2, 5, C.shadow);
      rect(cx, ridge - 5, 4, 6, '#7a3a2a');
      rect(cx, ridge - 5, 4, 1, '#94503a');
      rect(cx + 1, ridge - 5, 2, 1, PAL.ink);
    }
  } else if (roof === 'flat') {
    rect(x, top, w, d, C.flat);
    for (let i = 0; i < 14; i++) px(x + Math.floor(phash(seed, i, 927) * w), top + Math.floor(phash(i, seed, 927) * d), i % 3 ? C.flat2 : C.flat3);
    // Mancha de infiltração.
    if (phash(seed, 9, 935) < 0.5) rect(x + 3 + Math.floor(phash(seed, 10, 936) * Math.max(1, w - 12)), top + d - 6, 7, 3, '#4c4a45');
    // Platibanda: borda com luz em cima e à esquerda.
    rect(x, top, w, 1, C.flat3);
    rect(x, top, 1, d, C.flat3);
    rect(x, top + d - 1, w, 1, C.flat2);
    rect(x + w - 1, top, 1, d, C.flat2);
    // Caixa d'água azul com tampa.
    const tx = x + 3 + Math.floor(phash(seed, 5, 928) * Math.max(1, w - 12));
    const ty = top + 2;
    rect(tx + 2, ty + 2, 7, 6, C.shadow);
    rect(tx, ty, 7, 6, C.tank);
    rect(tx, ty, 7, 1, C.tank2);
    rect(tx, ty, 1, 6, C.tank2);
    rect(tx + 2, ty + 2, 3, 2, '#2a4f73');
    rect(tx, ty + 5, 7, 1, '#2a4f73');
    if (phash(seed, 11, 937) < 0.5 && w > 20) {
      // Antena de TV e um varal com roupa esquecida.
      const ax = tx + 11 < x + w - 3 ? tx + 11 : tx - 5;
      rect(ax, ty, 1, 5, '#2e3034');
      rect(ax - 2, ty + 1, 5, 1, '#2e3034');
      const vy = top + d - 4;
      rect(x + 3, vy, w - 6, 1, '#3a3a3e');
      for (let c = x + 5; c < x + w - 5; c += 4) if (phash(seed, c, 938) < 0.5) rect(c, vy + 1, 2, 2, ['#8f3324', '#a39c8d', '#3f6f8f', '#b08a3a'][c % 4]);
    }
  } else if (roof === 'metal') {
    rect(x - 1, top, w + 2, d, C.metal);
    for (let c = x; c < x + w; c += 3) {
      rect(c, top, 1, d, C.metal2);
      rect(c + 1, top, 1, d, '#66717a');
    }
    rect(x - 1, top, w + 2, 1, '#7d888f');
    for (let i = 0; i < 5; i++) rect(x + Math.floor(phash(seed, i, 929) * (w - 3)), top + Math.floor(phash(i, seed, 929) * (d - 2)), 3, 2, PAL.rust);
    // Pedras e pneu segurando a telha.
    for (let i = 0; i < 2; i++) rect(x + 4 + i * Math.max(4, w - 12), top + 2 + i * 3, 3, 2, '#7a766c');
  } else {
    // Ruína: telhado queimado e caído, vigas à mostra e o escuro lá dentro.
    rect(x, top, w, d, '#2b2622');
    rect(x + 2, top + 2, Math.floor(w / 2), Math.floor(d / 2), PAL.ink);
    for (let c = x + 2; c < x + w - 2; c += 5) rect(c, top + 1, 1, d - 2, '#4a3a2e');
    for (let i = 0; i < 6; i++) rect(x + Math.floor(phash(seed, i, 930) * (w - 4)), top + Math.floor(phash(i, seed, 930) * (d - 2)), 4, 1, '#5a4636');
    rect(x, top, w, 1, '#3b332c');
    for (let i = 0; i < 4; i++) px(x + Math.floor(phash(seed, i, 939) * w), top + d - 1 - Math.floor(phash(i, seed, 939) * 3), '#1a1715');
  }
  // Contorno escuro: recorta a casa do chão e deixa tudo nítido.
  const ox = x - eave - 1;
  const ow = w + eave * 2 + 2;
  rect(ox, top - 1, ow, 1, PAL.ink);
  rect(ox, y + d, ow, 1, PAL.ink);
  rect(ox, top - 1, 1, d + alt + 2, PAL.ink);
  rect(ox + ow - 1, top - 1, 1, d + alt + 2, PAL.ink);
  // Beiral: linha escura onde o telhado encontra a fachada.
  rect(x - eave, y + d - alt, w + eave * 2, 1, PAL.ink);
  rect(x, y + d - alt + 1, w, 1, 'rgba(17,17,19,0.35)');
}

/**
 * Laje grande: placas de concreto, poças, caixas de ar-condicionado, respiros, a casinha da escada e
 * caixas d'água. Para prédios e locais, que senão ficam um retângulo cinza vazio.
 */
function roofDetails({ rect, px }: { rect: Rect; px: Px }, x: number, top: number, w: number, d: number, seed: number, tanks = true): void {
  for (let c = x + 12; c < x + w - 2; c += 12) rect(c, top + 1, 1, d - 2, C.flat2);
  for (let r = top + 10; r < top + d - 2; r += 10) rect(x + 1, r, w - 2, 1, C.flat2);
  // Poças escuras de chuva.
  for (let i = 0; i < 3; i++) {
    const px0 = x + 4 + Math.floor(phash(seed, i, 1020) * Math.max(1, w - 16));
    const py0 = top + 3 + Math.floor(phash(i, seed, 1020) * Math.max(1, d - 8));
    rect(px0, py0, 9, 3, '#3a3c40');
    rect(px0 + 2, py0 - 1, 5, 1, '#3a3c40');
    px(px0 + 2, py0 + 1, '#5a6066');
  }
  // Casinha da escada.
  const sx = x + w - 18;
  rect(sx + 2, top + 4, 12, 9, C.shadow);
  rect(sx, top + 2, 12, 9, '#77736b');
  rect(sx, top + 2, 12, 1, '#8a857c');
  rect(sx, top + 8, 12, 3, '#5f5b54');
  rect(sx + 4, top + 8, 4, 3, PAL.ink);
  rect(sx - 1, top + 1, 14, 1, PAL.ink);
  // Ar-condicionado e respiros.
  for (let i = 0; i < 3; i++) {
    const ax = x + 6 + Math.floor(phash(seed, i, 1021) * Math.max(1, w - 34));
    const ay = top + 4 + Math.floor(phash(i, seed, 1021) * Math.max(1, d - 12));
    rect(ax + 1, ay + 1, 7, 5, C.shadow);
    rect(ax, ay, 7, 5, '#8d877c');
    rect(ax + 1, ay + 1, 5, 3, '#5a5650');
    px(ax + 3, ay + 2, '#2a2826');
  }
  if (tanks) {
    for (let i = 0; i < 2; i++) {
      const tx = x + 5 + i * 11;
      const ty = top + d - 10;
      rect(tx + 2, ty + 2, 8, 6, C.shadow);
      rect(tx, ty, 8, 6, C.tank);
      rect(tx, ty, 8, 1, C.tank2);
      rect(tx, ty, 1, 6, C.tank2);
      rect(tx, ty + 5, 8, 1, '#2a4f73');
    }
  }
}

/** Contorno escuro de um prédio (telhado e fachada juntos). */
function outlineBox(rect: Rect, x: number, y: number, w: number, h: number): void {
  rect(x, y, w, 1, PAL.ink);
  rect(x, y + h - 1, w, 1, PAL.ink);
  rect(x, y, 1, h, PAL.ink);
  rect(x + w - 1, y, 1, h, PAL.ink);
}

/** Praça largada: mato alto, árvores, um banco e o coreto sem telhado. */
function square(p: { rect: Rect; px: Px }, X: number, Y: number, W: number, H: number, bx: number, by: number): void {
  const { rect } = p;
  rect(X + 2, Y + 2, W - 4, H - 4, PAL.grass1);
  lot(p, X + 2, Y + 2, W - 4, H - 4, bx + 50, by + 50);
  // Caminhos em cruz.
  rect(X + 2, Y + Math.floor(H / 2) - 2, W - 4, 4, PAL.dirt1);
  rect(X + Math.floor(W / 2) - 2, Y + 2, 4, H - 4, PAL.dirt1);
  rect(X + Math.floor(W / 2) - 7, Y + Math.floor(H / 2) - 6, 14, 12, '#5e5b55');
  rect(X + Math.floor(W / 2) - 5, Y + Math.floor(H / 2) - 4, 10, 8, PAL.dirt0);
  for (const [fx, fy] of [[0.12, 0.1], [0.68, 0.08], [0.1, 0.6], [0.72, 0.62], [0.4, 0.66]]) tree(p, X + Math.round(W * fx), Y + Math.round(H * fy), bx + fx * 10, by + fy * 10);
  rect(X + 10, Y + Math.floor(H / 2) + 5, 10, 2, PAL.wood2);
  rect(X + 10, Y + Math.floor(H / 2) + 7, 10, 1, C.shadow);
}

/** Árvore com contorno e três tons; algumas estão secas, só galhos. */
function tree({ rect, px }: { rect: Rect; px: Px }, x: number, y: number, sx: number, sy: number): void {
  const dead = phash(sx, sy, 951) < 0.22;
  rect(x + 5, y + 13, 14, 3, C.shadow);
  rect(x + 7, y + 10, 2, 5, PAL.wood0);
  if (dead) {
    // Galhos secos em leque.
    for (const [dx, dy] of [[-4, -6], [4, -6], [-2, -9], [3, -8], [0, -10]]) {
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let k = 0; k <= steps; k++) px(x + 8 + Math.round((dx * k) / steps), y + 10 + Math.round((dy * k) / steps), k < 2 ? PAL.wood1 : '#3a2e24');
    }
    return;
  }
  // Copa: contorno, sombra embaixo à direita, luz em cima à esquerda.
  const shape = [
    [4, 0, 8], [2, 1, 12], [1, 2, 14], [0, 3, 16], [0, 4, 16], [0, 5, 16], [0, 6, 16], [1, 7, 14], [1, 8, 14], [3, 9, 10], [5, 10, 6],
  ];
  for (const [ox, oy, w] of shape) rect(x + ox, y + oy, w, 1, C.leaf);
  for (const [ox, oy, w] of shape.slice(0, 7)) rect(x + ox + 1, y + oy, Math.max(0, w - 6), 1, C.leaf2);
  for (let i = 0; i < 9; i++) px(x + 3 + Math.floor(phash(sx, sy, 940 + i) * 8), y + 1 + Math.floor(phash(sy, sx, 940 + i) * 5), C.leaf3);
  for (let i = 0; i < 5; i++) px(x + 6 + Math.floor(phash(sx, sy, 945 + i) * 8), y + 6 + Math.floor(phash(sy, sx, 945 + i) * 4), '#243419');
  // Contorno.
  for (const [ox, oy, w] of shape) {
    px(x + ox - 1, y + oy, PAL.ink);
    px(x + ox + w, y + oy, PAL.ink);
  }
  rect(x + 4, y - 1, 8, 1, PAL.ink);
  rect(x + 5, y + 11, 6, 1, PAL.ink);
}

function rubble({ rect, px }: { rect: Rect; px: Px }, x: number, y: number, sx: number, sy: number): void {
  for (let i = 0; i < 7; i++) {
    const rx = x + Math.floor(phash(sx, sy, 960 + i) * 26);
    const ry = y + Math.floor(phash(sy, sx, 960 + i) * 6);
    rect(rx, ry, 3 + (i % 3), 2, i % 2 ? '#5e5b55' : '#7a4a32');
    px(rx, ry + 2, PAL.ink);
  }
}

function cars({ rect }: { rect: Rect; px: Px }): void {
  // Largados onde pararam: no meio da rua, de lado, alguns batidos.
  const spots: [number, number, boolean][] = [[2, 3, true], [11, 7, true], [21, 11, true], [7, 15, true], [17, 3, true], [25, 15, true], [9, 9, false], [19, 13, false], [4, 1, false], [24, 6, false]];
  spots.forEach(([tx, ty, horiz], i) => {
    const color = CARS[i % CARS.length];
    const x = tx * T + (horiz ? 3 : 7);
    const y = ty * T + (horiz ? 8 : 3);
    const w = horiz ? 22 : 13;
    const h = horiz ? 12 : 22;
    rect(x + 2, y + 2, w, h, C.shadow);
    rect(x, y, w, h, color);
    rect(x, y, w, 1, '#9a948a');
    // Para-brisa e vidro de trás.
    if (horiz) {
      rect(x + 14, y + 2, 4, h - 4, C.win);
      rect(x + 3, y + 2, 3, h - 4, C.win);
    } else {
      rect(x + 2, y + 4, w - 4, 4, C.win);
      rect(x + 2, y + 15, w - 4, 3, C.win);
    }
    if (i % 3 === 0) rect(x + 6, y + 3, 4, 3, PAL.rust);
  });
}

// ---------------- Prédios especiais ----------------

function landmark(p: { rect: Rect; px: Px }, l: Landmark): void {
  const { rect, px } = p;
  const x = Math.round(l.x * T);
  const y = Math.round(l.y * T);
  const w = Math.round(l.w * T);
  const h = Math.round(l.h * T);
  // Chão do terreno: cimento gasto.
  rect(x, y, w, h, C.walk);
  for (let i = 0; i < 30; i++) px(x + Math.floor(phash(i, l.x, 970) * w), y + Math.floor(phash(l.y, i, 970) * h), i % 2 ? '#423f3a' : '#55524c');
  const alt = 14;
  const bx = x + 3;
  const bw = w - 6;
  const top = y + 4;
  const d = h - 10 - alt;
  const faceY = top + d;
  const shadowBox = () => {
    rect(bx + bw, top + 3, 4, d + alt, C.shadow);
    rect(bx + 2, faceY + alt, bw, 3, C.shadow);
  };
  const outline = () => {
    outlineBox(rect, bx - 1, top - 1, bw + 2, d + alt + 2);
    rect(bx, faceY, bw, 1, PAL.ink);
  };
  const windows = (color: string, every = 9) => {
    for (let wx = bx + 4; wx + 5 < bx + bw; wx += every) rect(wx, faceY + 3, 5, 4, color);
  };
  switch (l.kind) {
    case 'market': {
      shadowBox();
      rect(bx, top, bw, d, C.flat);
      rect(bx, top, bw, 1, C.flat3);
      roofDetails(p, bx, top, bw, d, 11);
      rect(bx, faceY, bw, alt, '#8a8173');
      // Letreiro e toldo listrado.
      rect(bx + 10, faceY + 1, bw - 20, 4, '#b08a3a');
      for (let i = 0; i < 6; i++) rect(bx + 14 + i * 12, faceY + 2, 6, 2, '#3a2e1c');
      for (let sx = bx; sx < bx + bw; sx += 6) {
        rect(sx, faceY + 6, 3, 3, '#8f3324');
        rect(sx + 3, faceY + 6, 3, 3, '#a39c8d');
      }
      rect(bx + 6, faceY + 9, bw - 12, 5, C.win);
      rect(bx + 30, faceY + 9, 1, 5, '#7f9196');
      // Carrinho largado.
      rect(bx + bw - 14, faceY + alt + 4, 6, 4, '#8d877c');
      px(bx + bw - 14, faceY + alt + 8, PAL.ink);
      px(bx + bw - 9, faceY + alt + 8, PAL.ink);
      outline();
      break;
    }
    case 'garage': {
      shadowBox();
      rect(bx - 1, top, bw + 2, d, C.metal);
      for (let c = bx; c < bx + bw; c += 3) rect(c, top, 1, d, C.metal2);
      for (let i = 0; i < 6; i++) rect(bx + Math.floor(phash(i, 1, 980) * (bw - 4)), top + Math.floor(phash(1, i, 980) * (d - 2)), 4, 2, PAL.rust);
      rect(bx, faceY, bw, alt, '#6f7a72');
      // Duas portas de enrolar, uma meio aberta.
      for (const [dx, open] of [[6, false], [bw / 2 + 2, true]] as const) {
        const ox = bx + Math.round(dx);
        const ow = Math.round(bw / 2 - 10);
        rect(ox, faceY + 2, ow, alt - 2, '#55595c');
        for (let r = faceY + 3; r < faceY + alt; r += 2) rect(ox, r, ow, 1, '#6e7376');
        if (open) rect(ox, faceY + 8, ow, alt - 8, PAL.ink);
      }
      // Pneus empilhados e mancha de óleo.
      for (let i = 0; i < 3; i++) rect(bx + bw - 6, faceY + alt + 2 - i * 3, 7, 3, '#1b1b1d');
      rect(bx + 20, faceY + alt + 4, 10, 3, '#1f1f22');
      outline();
      break;
    }
    case 'pharmacy': {
      shadowBox();
      rect(bx, top, bw, d, C.flat);
      rect(bx, top, bw, 1, C.flat3);
      roofDetails(p, bx, top, bw, d, 23);
      rect(bx, faceY, bw, alt, '#7a8a84');
      // Cruz verde (apagada, uma parte quebrada).
      const cx = bx + Math.round(bw / 2);
      rect(cx - 2, faceY + 1, 4, 10, '#3f7a52');
      rect(cx - 5, faceY + 4, 10, 4, '#3f7a52');
      px(cx + 4, faceY + 4, PAL.ink);
      rect(bx + 4, faceY + 6, 12, 7, C.win);
      rect(bx + bw - 16, faceY + 6, 12, 7, C.win);
      rect(bx + 6, faceY + 9, 8, 1, PAL.wood2);
      outline();
      break;
    }
    case 'hospital': {
      shadowBox();
      rect(bx, top, bw, d, '#a39d91');
      rect(bx, top, bw, 1, '#b7b1a4');
      rect(bx + 4, top + 3, bw - 8, d - 6, '#8d877c');
      // Cruz vermelha no telhado.
      const cx = bx + Math.round(bw / 2);
      const cy = top + Math.round(d / 2);
      rect(cx - 3, cy - 8, 6, 16, '#7a2e22');
      rect(cx - 8, cy - 3, 16, 6, '#7a2e22');
      rect(bx, faceY, bw, alt, '#9a9384');
      windows(C.win, 8);
      rect(bx, faceY + 9, bw, 1, '#7b766c');
      rect(cx - 6, faceY + 8, 12, 6, PAL.ink);
      // Ambulância largada na frente.
      const ax = cx + 14;
      const ay = faceY + alt + 3;
      rect(ax + 2, ay + 2, 22, 11, C.shadow);
      rect(ax, ay, 22, 11, '#b7b1a4');
      rect(ax, ay + 4, 22, 2, '#7a2e22');
      rect(ax + 15, ay + 2, 4, 7, C.win);
      outline();
      break;
    }
    case 'police': {
      shadowBox();
      rect(bx, top, bw, d, '#57595f');
      rect(bx, top, bw, 1, '#6a6c72');
      roofDetails(p, bx, top, bw, d, 37, false);
      // Antena de rádio com estais.
      rect(bx + 10, top + 2, 1, 10, '#2e3034');
      rect(bx + 7, top + 4, 7, 1, '#2e3034');
      px(bx + 10, top + 1, '#8f3324');
      rect(bx, faceY, bw, alt, '#58616e');
      rect(bx, faceY + 2, bw, 2, '#2f4e7a');
      windows('#141619', 10);
      for (let wx = bx + 4; wx + 5 < bx + bw; wx += 10) rect(wx + 2, faceY + 4, 1, 4, '#8d877c'); // grades
      // Viatura batida.
      const vx = bx + 6;
      const vy = faceY + alt + 3;
      rect(vx + 2, vy + 2, 22, 11, C.shadow);
      rect(vx, vy, 22, 11, '#1e1f22');
      rect(vx + 6, vy, 10, 11, '#b7b1a4');
      rect(vx + 9, vy + 4, 2, 3, '#3f6f8f');
      rect(vx + 12, vy + 4, 2, 3, '#8f3324');
      outline();
      break;
    }
    case 'shelter': {
      // A casa do grupo: muro, quintal verde com horta e uma janela acesa.
      rect(x + 2, y + 2, w - 4, h - 4, PAL.grass1);
      for (let i = 0; i < 20; i++) px(x + 4 + Math.floor(phash(i, 3, 990) * (w - 8)), y + 4 + Math.floor(phash(3, i, 990) * (h - 8)), i % 2 ? PAL.grass2 : PAL.dry1);
      rect(x + 2, y + 2, w - 4, 2, '#6e685d');
      rect(x + 2, y + 2, 2, h - 4, '#6e685d');
      rect(x + w - 4, y + 2, 2, h - 4, '#6e685d');
      rect(x + 2, y + h - 4, w - 4, 2, '#6e685d');
      rect(x + Math.round(w / 2) - 3, y + h - 4, 6, 2, PAL.wood2); // portão
      const hx = x + 8;
      const hw = Math.round(w * 0.58);
      const hy = y + 18;
      const hd = h - 34;
      house(p, hx, hy + 10, hw, hd - 10, 'tile', 77);
      // Janela acesa: a vela de quem ficou.
      rect(hx + 3, hy + hd - 7, 4, 3, '#d9a04a');
      px(hx + 4, hy + hd - 6, '#f2c46a');
      // Horta e barris no quintal.
      const gx = hx + hw + 6;
      rect(gx, hy, 18, 10, PAL.wood1);
      rect(gx + 1, hy + 1, 16, 8, PAL.dirt0);
      for (let i = 0; i < 4; i++) rect(gx + 2 + i * 4, hy + 2, 2, 3, PAL.grass2);
      rect(gx + 2, hy + 16, 6, 8, '#3a6a96');
      rect(gx + 2, hy + 16, 6, 1, '#5585b4');
      break;
    }
  }
}

/**
 * Névoa sobre um lugar ainda não descoberto: mancha escura com borda pontilhada.
 */
export function fogTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `fog-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const k = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) + (vnoise(x, y, 10, 995) - 0.5) * 0.5;
      const v = 1 - k;
      if (v <= 0) continue;
      const level = Math.min(1, v * 2.2);
      if (level < (bayer[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] + 0.5) / 16) continue;
      ctx.fillStyle = 'rgba(10,10,13,0.92)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  tex.refresh();
  return key;
}


/**
 * Vida (e morte) da rua: faixas de pedestre apagadas perto dos cruzamentos, bueiros, sacos de lixo no
 * meio-fio e postes com fios, alguns arrebentados e caídos.
 */
function streetLife({ rect, px }: { rect: Rect; px: Px }): void {
  for (let ty = 3; ty < CITY_H; ty += 4) {
    for (let tx = 4; tx < CITY_W; tx += 5) {
      if (tx === RIVER_X) continue;
      // Faixa de pedestre no lado direito do cruzamento.
      if (tx + 1 < CITY_W && tx + 1 !== RIVER_X && phash(tx, ty, 1000) < 0.6) {
        for (let k = 0; k < 6; k++) if (phash(tx * 9 + k, ty, 1001) > 0.25) rect((tx + 1) * T + 2, ty * T + 3 + k * 4, 5, 2, '#6c6a62');
      }
      // Poste na quina do quarteirão (canto de cima à esquerda do cruzamento).
      const px0 = tx * T - 3;
      const py0 = ty * T - 3;
      if (phash(tx, ty, 1002) < 0.75) {
        rect(px0 + 2, py0 + 1, 3, 2, C.shadow);
        rect(px0, py0 - 6, 2, 8, '#4a3a2e');
        rect(px0 - 3, py0 - 6, 8, 1, '#3a2e24');
        px(px0 - 3, py0 - 7, '#7a766c');
        px(px0 + 4, py0 - 7, '#7a766c');
      }
    }
  }
  // Fios entre postes vizinhos: curva caída, alguns arrebentados pendurados.
  for (let ty = 3; ty < CITY_H; ty += 4) {
    for (let tx = 4; tx + 5 < CITY_W; tx += 5) {
      if (phash(tx, ty, 1002) >= 0.75 || phash(tx + 5, ty, 1002) >= 0.75) continue;
      const x0 = tx * T - 6;
      const x1 = (tx + 5) * T - 6;
      const y0 = ty * T - 10;
      const broken = phash(tx, ty, 1003) < 0.3;
      for (let x = x0; x <= x1; x++) {
        const t = (x - x0) / (x1 - x0);
        if (broken && t > 0.45 && t < 0.6) continue;
        const sag = Math.round(Math.sin(t * Math.PI) * 9);
        px(x, y0 + sag, 'rgba(17,17,19,0.75)');
      }
      if (broken) for (let k = 0; k < 10; k++) px(x0 + Math.round((x1 - x0) * 0.45), y0 + 8 + k, 'rgba(17,17,19,0.75)');
    }
  }
  // Bueiros e sacos de lixo.
  for (let ty = 0; ty < CITY_H; ty++) {
    for (let tx = 0; tx < CITY_W; tx++) {
      if (!isStreet(tx, ty) || tx === RIVER_X) continue;
      const X = tx * T;
      const Y = ty * T;
      if (phash(tx, ty, 1010) < 0.08) {
        rect(X + 10, Y + 10, 7, 5, '#1d1e20');
        rect(X + 11, Y + 11, 5, 1, '#3a3b3e');
        rect(X + 11, Y + 13, 5, 1, '#3a3b3e');
      }
      if (phash(tx, ty, 1011) < 0.12) {
        const x = X + 2 + Math.floor(phash(tx, ty, 1012) * 20);
        const y = Y + (ty % 4 === 3 ? 2 : 2 + Math.floor(phash(tx, ty, 1013) * 20));
        for (let k = 0; k < 3; k++) {
          rect(x + k * 4, y + (k % 2), 4, 4, '#26272b');
          px(x + k * 4 + 1, y + (k % 2), '#45474d');
        }
        rect(x + 1, y + 4, 12, 1, C.shadow);
      }
    }
  }
}

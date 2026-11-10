// Desenha a planta do abrigo, limpa e no enquadramento exato do jogo, para servir de
// referência à pintura (npm run art -- shelter). Precisa bater com src/game/ShelterScene.ts.
import sharp from 'sharp';

const W = 28;
const H = 20;
const TILE = 28;
const WALL_H = 14;
const S = 2; // pixels por pixel lógico
const WALLS = [
  [[10, 1], [10, 7]],
  [[18, 1], [18, 18]],
  [[0, 8], [17, 8]],
  [[0, 14], [17, 14]],
  [[6, 15], [6, 18]],
];
const GAPS = [[10, 4], [18, 4], [18, 11], [5, 8], [14, 8], [3, 14], [12, 14], [6, 17]];
const DOOR = [12, 19];

const grid = new Array(W * H).fill(false);
for (let x = 0; x < W; x++) {
  grid[x] = true;
  if (x !== DOOR[0]) grid[(H - 1) * W + x] = true;
}
for (let y = 0; y < H; y++) {
  grid[y * W] = true;
  grid[y * W + W - 1] = true;
}
for (const [[x0, y0], [x1, y1]] of WALLS) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!GAPS.some(([gx, gy]) => gx === x && gy === y)) grid[y * W + x] = true;
}
const isWall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x];
const floor = (x, y) => {
  if (x >= 19 && y >= 9) return [70, 92, 48]; // quintal
  if (x >= 19) return [110, 108, 102]; // cimento
  if ((x >= 11 && x <= 17 && y <= 7) || (y >= 15 && x <= 5)) return [176, 172, 160]; // azulejo
  if (y >= 15 && x >= 7 && x <= 17) return [110, 108, 102];
  return [122, 86, 54]; // madeira
};

// 4:3 exato: a altura lógica (574) ganha 14 px de margem embaixo.
const LW = W * TILE;
const LH = 588;
const img = Buffer.alloc(LW * S * LH * S * 3, 12);
const rect = (x, y, w, h, [r, g, b]) => {
  for (let j = Math.max(0, y * S); j < Math.min(LH * S, (y + h) * S); j++) {
    for (let i = Math.max(0, x * S); i < Math.min(LW * S, (x + w) * S); i++) {
      const o = (j * LW * S + i) * 3;
      img[o] = r;
      img[o + 1] = g;
      img[o + 2] = b;
    }
  }
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isWall(x, y)) rect(x * TILE, y * TILE + WALL_H, TILE, TILE, floor(x, y));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!isWall(x, y)) continue;
    // Topo claro, deslocado para cima; frente escura se embaixo não for parede.
    rect(x * TILE, y * TILE, TILE, TILE, [214, 208, 196]);
    if (!isWall(x, y + 1)) rect(x * TILE, y * TILE + TILE, TILE, WALL_H, [96, 90, 82]);
  }
}
rect(DOOR[0] * TILE + 3, DOOR[1] * TILE + TILE - 10, TILE - 6, WALL_H + 10, [90, 54, 26]);

await sharp(img, { raw: { width: LW * S, height: LH * S, channels: 3 } }).png().toFile('art/ref/shelter-plan.png');
console.log('art/ref/shelter-plan.png');

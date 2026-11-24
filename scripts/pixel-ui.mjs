// Interface em pixel art: retratos dos sobreviventes e cenas das telas e dos locais, recortados das
// folhas geradas (pixel-faces-*, pixel-scenes-*) e reduzidos na grade original.
//   node scripts/pixel-ui.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { snapExact } from './pixel.mjs';

const OUT = 'public/pixel/ui/';
const TMP = 'art/pixel/tmp-ui-';
mkdirSync(OUT, { recursive: true });

// ---------- Retratos ----------

/** Folha 2×2 → ids em ordem de leitura. Retrato final de 64×64. */
const FACES = {
  'art/raw/pixel-faces-a.jpg': ['marta', 'iuri', 'lena', 'bruno'],
  'art/raw/pixel-faces-b.jpg': ['ana', 'caio', 'dona_rita', 'teo'],
};
const FACE = 64;

/** Fica só com o maior pedaço conectado (tira lampião e sobras de outra célula). */
function keepLargest(buf, w, h) {
  const seen = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestN = 0;
  let id = 0;
  for (let p = 0; p < w * h; p++) {
    if (buf[p * 4 + 3] === 0 || seen[p] >= 0) continue;
    const stack = [p];
    seen[p] = id;
    let n = 0;
    while (stack.length) {
      const q = stack.pop();
      n++;
      const x = q % w;
      const y = (q - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nq = ny * w + nx;
        if (buf[nq * 4 + 3] && seen[nq] < 0) {
          seen[nq] = id;
          stack.push(nq);
        }
      }
    }
    if (n > bestN) {
      bestN = n;
      best = id;
    }
    id++;
  }
  for (let p = 0; p < w * h; p++) if (seen[p] !== best) buf[p * 4 + 3] = 0;
}

for (const [src, ids] of Object.entries(FACES)) {
  const { width } = await sharp(src).metadata();
  const cell = width / 2;
  for (let i = 0; i < 4; i++) {
    const tmp = `${TMP}${ids[i]}.png`;
    await sharp(src)
      .extract({ left: Math.round((i % 2) * cell) + 4, top: Math.round(Math.floor(i / 2) * cell) + 4, width: Math.round(cell) - 8, height: Math.round(cell) - 8 })
      .png()
      .toFile(tmp);
    const r = await snapExact(tmp, `${TMP}${ids[i]}-s.png`, { pixel: (cell - 8) / FACE, colors: 26 });
    const { data, info } = await sharp(`${TMP}${ids[i]}-s.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    keepLargest(data, info.width, info.height);
    // O lampião da folha encostou no ombro da Marta: corta a faixa da direita.
    const trim = { marta: 57 }[ids[i]];
    if (trim) for (let y = 0; y < info.height; y++) for (let x = trim; x < info.width; x++) data[(y * info.width + x) * 4 + 3] = 0;
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${OUT}face-${ids[i]}.png`);
    console.log(`face-${ids[i]}`, `${r.width}×${r.height}`);
  }
}

// ---------- Cenas ----------

const SCENES = {
  'art/raw/pixel-scenes-a.jpg': ['title', 'door', 'raiders', 'ending-boat'],
  'art/raw/pixel-scenes-b.jpg': ['ending-dead', 'market', 'garage', 'pharmacy'],
  'art/raw/pixel-scenes-c.jpg': ['hospital', 'police', 'river', 'rooftop'],
};
const SCENE_PX = 4;

/** Letras de 3×5 desenhadas à mão (só as que as placas usam). */
const GLYPHS = {
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  G: ['011', '100', '101', '101', '011'],
  I: ['111', '010', '010', '010', '111'],
  N: ['101', '111', '111', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'],
  º: ['010', '101', '010', '000', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

/**
 * Placa em português no lugar da que veio em inglês: pinta o miolo da placa com a cor do fundo dela
 * (amostrada no canto) e escreve o texto centrado, em letras de 3×5.
 */
function sign(buf, w, box, text, ink, fill) {
  const at = (x, y) => (y * w + x) * 4;
  const bg = fill ?? [...buf.subarray(at(box.x + 1, box.y + 1), at(box.x + 1, box.y + 1) + 3)];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = at(x, y);
      [buf[i], buf[i + 1], buf[i + 2]] = bg;
    }
  }
  const tw = text.length * 4 - 1;
  const x0 = box.x + Math.floor((box.w - tw) / 2);
  const y0 = box.y + Math.floor((box.h - 5) / 2);
  [...text].forEach((ch, k) => {
    const g = GLYPHS[ch];
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy][gx] !== '1') continue;
        const i = at(x0 + k * 4 + gx, y0 + gy);
        [buf[i], buf[i + 1], buf[i + 2]] = ink;
      }
    }
  });
}

/** Onde ficam as placas em inglês (em pixels da cena já reduzida) e o que escrever no lugar. */
const SIGNS = {
  pharmacy: { box: { x: 64, y: 7, w: 106, h: 13 }, text: 'DROGARIA', ink: [40, 110, 60] },
  hospital: { box: { x: 66, y: 37, w: 38, h: 6 }, text: 'SANTA CASA', ink: [110, 40, 32] },
  police: { box: { x: 73, y: 40, w: 27, h: 7 }, text: '23º DP', ink: [40, 44, 52], fill: [196, 194, 184] },
};

for (const [src, names] of Object.entries(SCENES)) {
  const { width, height } = await sharp(src).metadata();
  const cw = width / 2;
  const ch = height / 2;
  for (let i = 0; i < 4; i++) {
    const name = names[i];
    const tmp = `${TMP}${name}.png`;
    // Corta um pouco além da faixa preta entre as cenas.
    await sharp(src)
      .extract({ left: Math.round((i % 2) * cw) + 8, top: Math.round(Math.floor(i / 2) * ch) + 8, width: Math.round(cw) - 16, height: Math.round(ch) - 16 })
      .png()
      .toFile(tmp);
    const r = await snapExact(tmp, `${TMP}${name}-s.png`, { pixel: SCENE_PX, colors: 40, key: false });
    const { data, info } = await sharp(`${TMP}${name}-s.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const fix = SIGNS[name];
    if (fix) sign(data, info.width, fix.box, fix.text, fix.ink, fix.fill);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${OUT}scene-${name}.png`);
    console.log(`scene-${name}`, `${r.width}×${r.height}`);
  }
}

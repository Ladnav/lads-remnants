// Ferramentas de pixel art: paleta fixa e "encaixe" de imagens na grade.
//   node scripts/pixel.mjs palette                      monta art/pixel/palette.json a partir dos conceitos
//   node scripts/pixel.mjs snap <entrada> <saída> <largura> [--key] [--outline]
//        reduz para <largura> pixels de verdade, força a paleta e (opcional) tira o fundo magenta
//        e põe contorno escuro de 1 pixel.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const PALETTE_FILE = 'art/pixel/palette.json';

/** Distância de cor com peso perceptivo (o olho é mais sensível ao verde). */
function dist2(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const unhex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** k-means simples: 32 cores que representam bem as amostras. */
function kmeans(samples, k, iters = 24) {
  // Começa por cores espalhadas (k-means++ determinístico: sempre a mais distante).
  const centers = [samples[0]];
  while (centers.length < k) {
    let best = null;
    let bestD = -1;
    for (const s of samples) {
      const d = Math.min(...centers.map((c) => dist2(s, c)));
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    centers.push(best);
  }
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = dist2(s, centers[i]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      sum[bi][0] += s[0];
      sum[bi][1] += s[1];
      sum[bi][2] += s[2];
      sum[bi][3]++;
    }
    for (let i = 0; i < k; i++) if (sum[i][3]) centers[i] = [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]];
  }
  return centers.map((c) => c.map(Math.round));
}

async function buildPalette() {
  const files = ['art/raw/pixel-shelter.jpg', 'art/raw/pixel-raid.jpg', 'art/raw/pixel-characters.jpg'];
  const samples = [];
  for (const f of files) {
    const { data, info } = await sharp(f).resize(160, 120, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  const pal = kmeans(samples, 32).sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  mkdirSync('art/pixel', { recursive: true });
  writeFileSync(PALETTE_FILE, JSON.stringify(pal.map(hex), null, 1));
  const sw = pal.map((c, i) => ({ input: { create: { width: 24, height: 24, channels: 3, background: hex(c) } }, left: (i % 16) * 24, top: Math.floor(i / 16) * 24 }));
  await sharp({ create: { width: 384, height: 48, channels: 3, background: '#000' } }).composite(sw).png().toFile('art/pixel/palette.png');
  console.log(pal.map(hex).join(' '));
}

export function loadPalette() {
  return JSON.parse(readFileSync(PALETTE_FILE, 'utf8')).map(unhex);
}

/**
 * Encaixa uma imagem "que imita pixel art" na grade: reduz pela moda de cada bloco (sem borrar),
 * força a paleta e, se pedido, tira o fundo magenta e contorna de escuro.
 */
export async function snap(src, dest, width, { key = false, outline = false } = {}) {
  const pal = loadPalette();
  const meta = await sharp(src).metadata();
  const height = Math.round((meta.height * width) / meta.width);
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bw = info.width / width;
  const bh = info.height / height;
  const out = Buffer.alloc(width * height * 4);
  const nearest = (c) => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const d = dist2(c, pal[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  };
  // Fundo magenta: a cor dos cantos.
  const corner = [0, 1, 2].map((c) => data[c]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Moda das cores do miolo do bloco (ignora a borda, onde ficam as transições borradas).
      const votes = new Map();
      let bg = 0;
      let n = 0;
      for (let sy = Math.floor((y + 0.2) * bh); sy < Math.ceil((y + 0.8) * bh); sy++) {
        for (let sx = Math.floor((x + 0.2) * bw); sx < Math.ceil((x + 0.8) * bw); sx++) {
          const i = (sy * info.width + sx) * 3;
          const c = [data[i], data[i + 1], data[i + 2]];
          n++;
          // Fundo e franja rosada: vermelho e azul bem acima do verde.
          if (key && (dist2(c, corner) < 9000 || Math.min(c[0], c[2]) - c[1] > 45)) {
            bg++;
            continue;
          }
          const p = nearest(c);
          votes.set(p, (votes.get(p) ?? 0) + 1);
        }
      }
      const o = (y * width + x) * 4;
      if (key && bg > n * 0.5) continue;
      let best = 0;
      let bestV = -1;
      for (const [p, v] of votes) if (v > bestV) [best, bestV] = [p, v];
      out[o] = pal[best][0];
      out[o + 1] = pal[best][1];
      out[o + 2] = pal[best][2];
      out[o + 3] = 255;
    }
  }
  if (outline) {
    const dark = pal[0];
    const copy = Buffer.from(out);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (copy[o + 3]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < width && ny < height && copy[(ny * width + nx) * 4 + 3];
        });
        if (near) {
          out[o] = dark[0];
          out[o + 1] = dark[1];
          out[o + 2] = dark[2];
          out[o + 3] = 255;
        }
      }
    }
  }
  await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(dest);
  return { width, height };
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'palette') await buildPalette();
else if (cmd === 'snap') {
  const [src, dest, w] = rest.filter((a) => !a.startsWith('--'));
  const r = await snap(src, dest, Number(w), { key: rest.includes('--key'), outline: rest.includes('--outline') });
  console.log(`${dest}: ${r.width}×${r.height}`);
}

/**
 * Tamanho do "pixel falso" de uma imagem gerada: mede o comprimento dos trechos de cor igual nas
 * linhas e acha o período que melhor explica esses comprimentos (múltiplos dele).
 */
export async function detectGrid(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let y = 0; y < info.height; y += 3) {
    let run = 1;
    for (let x = 1; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      const j = i - 3;
      const diff = Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
      if (diff > 48) {
        if (run >= 2 && run <= 40) counts.set(run, (counts.get(run) ?? 0) + 1);
        run = 1;
      } else run++;
    }
  }
  let best = 4;
  let bestScore = -Infinity;
  for (let p = 2.5; p <= 12; p += 0.25) {
    let s = 0;
    for (const [L, n] of counts) s += n * Math.cos((2 * Math.PI * L) / p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

/**
 * Redução fiel: cada pixel de saída é a cor do miolo do bloco (sem votação, que apaga linhas finas),
 * com a paleta tirada da própria imagem (k cores). Tira o fundo magenta e corta as bordas vazias.
 */
export async function snapExact(src, dest, { pixel, colors = 28, key = true, scale = 1 } = {}) {
  const p = (pixel ?? (await detectGrid(src))) * scale;
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = Math.round(info.width / p);
  const h = Math.round(info.height / p);
  const corner = [data[0], data[1], data[2]];
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Média de um miolo 3×3 no centro do bloco.
      const cx = Math.min(info.width - 2, Math.max(1, Math.floor((x + 0.5) * p)));
      const cy = Math.min(info.height - 2, Math.max(1, Math.floor((y + 0.5) * p)));
      let r = 0, g = 0, b = 0, bg = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((cy + dy) * info.width + cx + dx) * 3;
        const c = [data[i], data[i + 1], data[i + 2]];
        if (key && (dist2(c, corner) < 12000 || Math.min(c[0], c[2]) - c[1] > 45)) bg++;
        r += c[0]; g += c[1]; b += c[2];
      }
      cells.push(bg >= 5 ? null : [r / 9, g / 9, b / 9]);
    }
  }
  const solid = cells.filter(Boolean);
  const pal = kmeans(solid.length > 4000 ? solid.filter((_, i) => i % Math.ceil(solid.length / 4000) === 0) : solid, Math.min(colors, solid.length));
  const out = Buffer.alloc(w * h * 4);
  cells.forEach((c, i) => {
    if (!c) return;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < pal.length; k++) {
      const d = dist2(c, pal[k]);
      if (d < bd) { bd = d; bi = k; }
    }
    out[i * 4] = pal[bi][0];
    out[i * 4 + 1] = pal[bi][1];
    out[i * 4 + 2] = pal[bi][2];
    out[i * 4 + 3] = 255;
  });
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(dest);
  return { width: w, height: h, pixel: p };
}

if (cmd === 'grid') console.log(await detectGrid(rest[0]));

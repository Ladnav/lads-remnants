// Personagens em pixel art: recorta as folhas de passo geradas (npm run art -- pixel-body-*),
// reduz fiel na grade original e grava public/pixel/body-<id>.png em quadros de 64×64,
// sempre na ordem: baixo, esquerda, direita, cima (4 quadros cada).
//   node scripts/pixel-bodies.mjs
import sharp from 'sharp';
import { snapExact } from './pixel.mjs';

const FRAME = 64;
const TMP = 'art/pixel/tmp-';

/**
 * Cada folha veio de um jeito: quantas colunas e se a 2ª linha anda para a direita (aí troca com a 3ª).
 * Conferido olhando a primeira figura da 2ª linha de cada folha.
 */
const SHEETS = {
  marta: { src: 'art/raw/pixel-marta.jpg', cols: 4, row2Right: true },
  iuri: { cols: 4, row2Right: false },
  lena: { cols: 4, row2Right: true },
  bruno: { cols: 4, row2Right: false },
  ana: { cols: 4, row2Right: true },
  caio: { cols: 6, row2Right: true },
  dona_rita: { cols: 4, row2Right: false },
  teo: { cols: 4, row2Right: true },
  'zombie-walker': { cols: 4, row2Right: true },
  'zombie-runner': { cols: 4, row2Right: false },
  'zombie-brute': { cols: 4, row2Right: true },
};

for (const [id, sheet] of Object.entries(SHEETS)) {
  const src = sheet.src ?? `art/raw/pixel-body-${id}.jpg`;
  const { height } = await sharp(src).metadata();
  // A altura da célula vira 64 px: é ela que define o tamanho do "pixel" da folha.
  const whole = `${TMP}${id}.png`;
  const snapped = await snapExact(src, whole, { pixel: height / 4 / FRAME, colors: 28 });
  const cellW = snapped.width / sheet.cols;
  const rows = sheet.row2Right ? [0, 2, 1, 3] : [0, 1, 2, 3];
  // Folha de 6 quadros: fica com 4 que mantêm o ritmo do passo.
  const pick = sheet.cols === 6 ? [0, 1, 3, 4] : [0, 1, 2, 3];
  const parts = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const left = Math.round(pick[c] * cellW);
      const w = Math.min(Math.round(cellW), snapped.width - left, FRAME);
      const cut = await sharp(whole)
        .extract({ left: left + Math.max(0, Math.round((cellW - w) / 2)), top: rows[r] * FRAME, width: w, height: FRAME })
        .png()
        .toBuffer();
      parts.push({ input: cut, left: c * FRAME + Math.floor((FRAME - w) / 2), top: r * FRAME });
    }
  }
  const sheetBuf = await sharp({ create: { width: FRAME * 4, height: FRAME * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(parts)
    .raw()
    .toBuffer();
  // Algumas folhas vêm com linhas de grade: limpa 2 px na borda de cada quadro (ninguém encosta nela).
  for (let y = 0; y < FRAME * 4; y++) {
    for (let x = 0; x < FRAME * 4; x++) {
      const fx = x % FRAME;
      const fy = y % FRAME;
      if (fx < 2 || fx >= FRAME - 2 || fy < 1) sheetBuf[(y * FRAME * 4 + x) * 4 + 3] = 0;
    }
  }
  await sharp(sheetBuf, { raw: { width: FRAME * 4, height: FRAME * 4, channels: 4 } }).png().toFile(`public/pixel/body-${id}.png`);
  console.log(`body-${id}.png`);
}

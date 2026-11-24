// Móveis do abrigo em pixel art na escala do jogo (TILE 28): recorta cada objeto das folhas
// geradas (pixel-props2 e pixel-props3) e reduz na grade original, na largura pedida.
//   node scripts/pixel-shelter.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { findObjects, snapExact } from './pixel.mjs';

const OUT = 'public/pixel/house/';
mkdirSync(OUT, { recursive: true });

/** Folha → nomes em ordem de leitura e largura final de cada um (pixels do jogo). */
const SHEETS = [
  {
    src: 'art/raw/pixel-props2.jpg',
    names: ['bed', 'stove', 'workbench', 'barrel', 'garden', 'crates', 'sacks', 'table', 'chair', 'shelf', 'bucket', 'barricade'],
    width: { bed: 44, stove: 38, workbench: 66, barrel: 30, garden: 82, crates: 38, sacks: 36, table: 56, chair: 21, shelf: 46, bucket: 16, barricade: 70 },
  },
  {
    src: 'art/raw/pixel-props3.jpg',
    names: ['filter', 'latrine', 'radio', 'collector', 'lantern', 'scrap'],
    width: { filter: 28, latrine: 30, radio: 46, collector: 34, lantern: 14, scrap: 40 },
  },
];

/** Versões de um tile para os móveis da incursão (public/pixel/raid). */
const RAID = { shelf: 26, table: 28, crates: 22 };
mkdirSync('public/pixel/raid/', { recursive: true });

for (const sheet of SHEETS) {
  const { boxes, W, H } = await findObjects(sheet.src);
  console.log(sheet.src, boxes.length, 'objetos');
  for (let i = 0; i < Math.min(boxes.length, sheet.names.length); i++) {
    const b = boxes[i];
    const name = sheet.names[i];
    const pad = 6;
    const tmp = `art/pixel/tmp-house-${name}.png`;
    const w = Math.min(W, b.x1 - b.x0 + pad * 2);
    await sharp(sheet.src)
      .extract({ left: Math.max(0, b.x0 - pad), top: Math.max(0, b.y0 - pad), width: w, height: Math.min(H, b.y1 - b.y0 + pad * 2) })
      .png()
      .toFile(tmp);
    // Pixel efetivo = largura do recorte ÷ largura final (o recorte tem 2 × pad de folga).
    const target = sheet.width[name];
    const r = await snapExact(tmp, OUT + name + '.png', { pixel: (b.x1 - b.x0) / target, colors: 24 });
    console.log(name, `${r.width}×${r.height}`);
    if (RAID[name] && sheet.src.includes('props2')) {
      const rr = await snapExact(tmp, `public/pixel/raid/${name}.png`, { pixel: (b.x1 - b.x0) / RAID[name], colors: 20 });
      console.log('  raid', name, `${rr.width}×${rr.height}`);
    }
  }
}

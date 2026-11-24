// Prova de estilo em pixel art: recorta as folhas geradas, encaixa na grade e na paleta
// e grava em public/pixel/ para a cena de teste (?pixel).
import sharp from 'sharp';
import { findObjects, snapExact } from './pixel.mjs';

// Tamanho do "pixel falso" medido em cada folha (zoom na imagem): é o que preserva o detalhe.
const MARTA_PX = 3.2;
const PROPS_PX = 3.5;

const TMP = 'art/pixel/tmp-';
const OUT = 'public/pixel/';

/** Marta: 4×4 quadros. A folha veio com direita e esquerda trocadas (linha 2 olha para a direita). */
async function marta() {
  const src = 'art/raw/pixel-marta.jpg';
  const { width } = await sharp(src).metadata();
  // A folha inteira de uma vez: uma paleta só para todos os quadros (sem a cor piscar entre eles).
  const whole = TMP + 'marta-all.png';
  await snapExact(src, whole, { pixel: width / 4 / 80, colors: 28 });
  const FRAME = 80;
  const rows = [0, 2, 1, 3]; // baixo, esquerda, direita, cima (a folha veio com direita e esquerda trocadas)
  const frames = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const buf = await sharp(whole).extract({ left: c * FRAME, top: rows[r] * FRAME, width: FRAME, height: FRAME }).png().toBuffer();
      frames.push({ input: buf, left: c * FRAME, top: r * FRAME });
    }
  }
  await sharp({ create: { width: FRAME * 4, height: FRAME * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(frames).png().toFile(OUT + 'marta.png');
  console.log('marta.png', FRAME);
}

/** Móveis: acha cada objeto separado pelo fundo magenta e encaixa na largura pedida (em pixels). */
async function props() {
  const src = 'art/raw/pixel-props2.jpg';
  const { boxes, W, H } = await findObjects(src);
  const names = ['bed', 'stove', 'workbench', 'barrel', 'garden', 'crates', 'sacks', 'table', 'chair', 'shelf', 'bucket', 'barricade'];
  console.log(boxes.length, 'objetos');
  for (let i = 0; i < Math.min(boxes.length, names.length); i++) {
    const b = boxes[i];
    const pad = 6;
    const tmp = `${TMP}p${i}.png`;
    await sharp(src).extract({ left: Math.max(0, b.x0 - pad), top: Math.max(0, b.y0 - pad), width: Math.min(W, b.x1 - b.x0 + pad * 2), height: Math.min(H, b.y1 - b.y0 + pad * 2) }).png().toFile(tmp);
    // O Gemini desenha tudo do mesmo tamanho: cada objeto volta à escala dele (altura perto de uma pessoa de 72 px).
    const SCALE = { bed: 1, stove: 1, workbench: 1.1, barrel: 1.3, garden: 1.25, crates: 1.3, sacks: 1.35, table: 1.12, chair: 1.45, shelf: 1.15, bucket: 2.2, barricade: 1.17 };
    const r = await snapExact(tmp, OUT + names[i] + '.png', { pixel: PROPS_PX, scale: SCALE[names[i]] ?? 1, colors: 24 });
    console.log(names[i], r.width + '×' + r.height);
  }
}

await marta();
await props();

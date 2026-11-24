// Prova de estilo em pixel art: recorta as folhas geradas, encaixa na grade e na paleta
// e grava em public/pixel/ para a cena de teste (?pixel).
import sharp from 'sharp';
import { snapExact } from './pixel.mjs';

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
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const solid = new Uint8Array(W * H);
  // O fundo é a cor do canto; só conta como objeto o que se afasta bem dela.
  const bg = [data[0], data[1], data[2]];
  for (let i = 0, p = 0; p < W * H; i += 3, p++) {
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    solid[p] = d > 110 ? 1 : 0;
  }
  // Componentes conectados (com folga de 6 px para juntar pedaços do mesmo objeto).
  const STEPS = [-6, -3, -1, 0, 1, 3, 6];
  const seen = new Uint8Array(W * H);
  const boxes = [];
  for (let p = 0; p < W * H; p++) {
    if (!solid[p] || seen[p]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    const stack = [p];
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop();
      const x = q % W, y = (q - x) / W;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const dy of STEPS) for (const dx of STEPS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nq = ny * W + nx;
        if (solid[nq] && !seen[nq]) { seen[nq] = 1; stack.push(nq); }
      }
    }
    if (n > 1500) boxes.push({ x0, y0, x1, y1 });
  }
  // Ordem de leitura: linhas de cima para baixo, e da esquerda para a direita.
  boxes.sort((a, b) => (Math.abs(a.y0 - b.y0) > 120 ? a.y0 - b.y0 : a.x0 - b.x0));
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

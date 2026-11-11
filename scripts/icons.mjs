// Gera os ícones do aplicativo (public/icons) a partir de um desenho vetorial:
// a casa do abrigo com uma janela acesa, no tom de lampião do jogo.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="glow" cx="50%" cy="58%" r="55%">
      <stop offset="0" stop-color="#3a2a16"/>
      <stop offset="1" stop-color="#0a0b0b"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#glow)"/>
  <g transform="translate(256 262) scale(${1 - pad}) translate(-256 -262)">
    <path d="M256 92 L420 232 L384 232 L384 404 L128 404 L128 232 L92 232 Z" fill="#17140f"/>
    <path d="M256 120 L392 236 L120 236 Z" fill="#8a4a3a"/>
    <path d="M256 120 L392 236 L256 236 Z" fill="#6f3a2e"/>
    <rect x="140" y="236" width="232" height="156" fill="#3b372f"/>
    <rect x="256" y="236" width="116" height="156" fill="#2e2b25"/>
    <rect x="232" y="312" width="48" height="80" fill="#17140f"/>
    <rect x="164" y="266" width="48" height="48" fill="#e0a04a"/>
    <rect x="164" y="266" width="48" height="48" fill="none" stroke="#17140f" stroke-width="6"/>
    <path d="M188 266 V314 M164 290 H212" stroke="#17140f" stroke-width="5"/>
    <rect x="300" y="266" width="48" height="48" fill="#17140f"/>
    <path d="M300 266 L348 314 M348 266 L300 314" stroke="#5a4630" stroke-width="7"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const png = (file, size, pad) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${file}`);
await png('icon-192.png', 192, 0);
await png('icon-512.png', 512, 0);
// A versão "maskable" tem margem: o sistema recorta as bordas em círculo ou quadrado arredondado.
await png('icon-maskable.png', 512, 0.22);
console.log('public/icons');

import Phaser from 'phaser';
import { PixelTestScene, VIEW_H, VIEW_W } from './PixelTestScene';

/**
 * Nitidez: o canvas tem exatamente (pixels do jogo × ampliação inteira) pixels FÍSICOS da tela, e o CSS
 * só desfaz a densidade do aparelho. Assim cada pixel do jogo vira um quadrado inteiro de pixels reais,
 * sem o navegador reamostrar nada (é isso que borra quando a escala dá 2,3×, ou em telas de 125%/150%).
 */
function screen(): { w: number; h: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  return { w: Math.floor((window.innerWidth - 16) * dpr), h: Math.floor((window.innerHeight - 110) * dpr), dpr };
}

/** Ampliação inteira. Em tela pequena de alta densidade (celular), no mínimo 2×, mostrando parte da sala. */
function deviceZoom(): number {
  const { w, h, dpr } = screen();
  const fit = Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H)));
  return dpr >= 2 && fit < 2 ? 2 : fit;
}

/** Tamanho do canvas em pixels físicos: a sala inteira, ou o que couber na tela. */
function canvasSize(z: number): { w: number; h: number } {
  const s = screen();
  return { w: Math.min(VIEW_W * z, Math.floor(s.w / z) * z), h: Math.min(VIEW_H * z, Math.floor(s.h / z) * z) };
}

let zoom = deviceZoom();
const scene = new PixelTestScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: canvasSize(zoom).w,
  height: canvasSize(zoom).h,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: '#111113',
  scale: { mode: Phaser.Scale.NONE },
  scene: [scene],
});
scene.setZoom(zoom);

function fitCss(): void {
  const dpr = window.devicePixelRatio || 1;
  const c = game.canvas;
  c.style.width = `${c.width / dpr}px`;
  c.style.height = `${c.height / dpr}px`;
}
game.events.once(Phaser.Core.Events.READY, fitCss);

window.addEventListener('resize', () => {
  zoom = deviceZoom();
  const size = canvasSize(zoom);
  game.scale.resize(size.w, size.h);
  scene.setZoom(zoom);
  fitCss();
});

document.getElementById('night')!.addEventListener('click', (e) => {
  const night = scene.toggleNight();
  (e.currentTarget as HTMLButtonElement).textContent = night ? '☀️ Dia' : '🌙 Noite';
});
let close = false;
document.getElementById('zoom')!.addEventListener('click', () => {
  close = !close;
  scene.setCloseUp(close);
});

// `?noite` abre já de noite (para capturas).
if (new URLSearchParams(location.search).has('noite')) {
  game.events.once(Phaser.Core.Events.READY, () => setTimeout(() => document.getElementById('night')!.click(), 300));
}

import Phaser from 'phaser';
import { WALL_H } from './oblique';

export interface LightSource {
  x: number;
  y: number;
  r: number;
  /** Fogo: continua aceso de dia. */
  fire?: boolean;
}

/** A noite: uma camada escura por cima de tudo, furada onde há fogo ou lampião. */
/** Área a céu aberto: recebe luz do dia (ou da lua) mesmo com a casa escura. `amount` vai de 0 a 1. */
export interface OpenArea {
  x: number;
  y: number;
  w: number;
  h: number;
  amount: number;
}

/**
 * Sombra de contato: uma mancha escura e macia, mais forte no meio. É o que "assenta"
 * objetos e pessoas no chão, sem sombra direcional (que brigaria com a luz pintada).
 */
export function softShadow(scene: Phaser.Scene): string {
  const key = 'soft-shadow';
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 128, 64)!;
  const ctx = tex.getContext();
  ctx.translate(64, 32);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0, 0, 0, 1)');
  g.addColorStop(0.45, 'rgba(0, 0, 0, 0.75)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-64, -64, 128, 128);
  tex.refresh();
  return key;
}

/** Modo pixel art: luz em degraus com pontilhado e paredes que fazem sombra. */
export interface PixelLightOptions {
  tile: number;
  cols: number;
  rows: number;
  /** A casa (tx, ty) barra a luz? (parede, porta fechada) */
  opaque: (tx: number, ty: number) => boolean;
}

/** Matriz de Bayer 4×4: decide quais pixels acendem em cada degrau de luz. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class NightLight {
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private last = '';
  private dark = 0;
  private sources: LightSource[] = [];
  private open: OpenArea[] = [];
  /** Casas que cada luz enxerga (calculado uma vez por posição das luzes). */
  private seen: Uint8Array[] = [];

  constructor(
    scene: Phaser.Scene,
    private w: number,
    private h: number,
    private pixel?: PixelLightOptions,
  ) {
    // Camada própria no modo pixel: filtro de pixel (a pintada usa filtro suave).
    const key = pixel ? `pixel-light-${w}x${h}` : 'shelter-light';
    this.tex = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : scene.textures.createCanvas(key, w, h)!;
    this.image = scene.add.image(0, -WALL_H, key).setOrigin(0).setDepth(100000);
  }

  /** `version` muda quando as paredes mudam (porta aberta ou derrubada), para refazer as sombras. */
  set(dark: number, sources: LightSource[], open: OpenArea[] = [], version = ''): void {
    const sig = `${version}|${dark}|${sources.map((s) => `${s.x},${s.y},${s.r}`).join(';')}|${open.map((o) => `${o.x},${o.y},${o.amount}`).join(';')}`;
    if (sig === this.last) return;
    this.last = sig;
    this.dark = dark;
    this.sources = sources;
    this.open = open;
    if (this.pixel) this.seen = sources.map((s) => this.visibleFrom(s));
    this.paint(sources);
  }

  /** Linha de visão da casa da luz até cada casa no alcance (Bresenham; a parede do fim é iluminada). */
  private visibleFrom(s: LightSource): Uint8Array {
    const { tile, cols, rows, opaque } = this.pixel!;
    const out = new Uint8Array(cols * rows);
    const lx = Math.floor(s.x / tile);
    const ly = Math.floor(s.y / tile);
    const reach = Math.ceil(s.r / tile) + 1;
    for (let ty = Math.max(0, ly - reach); ty <= Math.min(rows - 1, ly + reach); ty++) {
      for (let tx = Math.max(0, lx - reach); tx <= Math.min(cols - 1, lx + reach); tx++) {
        let x = lx;
        let y = ly;
        const dx = Math.abs(tx - lx);
        const dy = -Math.abs(ty - ly);
        const sx = lx < tx ? 1 : -1;
        const sy = ly < ty ? 1 : -1;
        let err = dx + dy;
        let clear = true;
        while (x !== tx || y !== ty) {
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y += sy;
          }
          if ((x !== tx || y !== ty) && opaque(x, y)) {
            clear = false;
            break;
          }
        }
        if (clear) out[ty * cols + tx] = 1;
      }
    }
    return out;
  }

  /** A chama treme: os focos mudam um pouco de tamanho. Só trabalha quando está escuro. */
  flicker(): void {
    if (this.dark <= 0) return;
    this.paint(this.sources.map((s) => ({ ...s, r: s.r * (0.96 + Math.random() * 0.08) })));
  }

  private paint(sources: LightSource[]): void {
    if (this.pixel) return this.paintPixel(sources);
    const dark = this.dark;
    const ctx = this.tex.getContext();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.w, this.h);
    this.image.setVisible(dark > 0);
    if (dark > 0) {
      ctx.fillStyle = `rgba(4, 7, 15, ${dark})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'destination-out';
      // Céu aberto: a escuridão some aos poucos na borda (camadas que se somam até o centro).
      const STEPS = 6;
      const FEATHER = 16;
      for (const o of this.open) {
        for (let i = 0; i < STEPS; i++) {
          const grow = FEATHER * (1 - i / (STEPS - 1)) - FEATHER / 2;
          ctx.fillStyle = `rgba(0, 0, 0, ${o.amount / STEPS})`;
          ctx.fillRect(o.x - grow, o.y + WALL_H - grow, o.w + grow * 2, o.h + grow * 2);
        }
      }
      for (const s of sources) {
        const g = ctx.createRadialGradient(s.x, s.y + WALL_H, 0, s.x, s.y + WALL_H, s.r);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
        g.addColorStop(0.45, 'rgba(0, 0, 0, 0.55)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - s.r, s.y + WALL_H - s.r, s.r * 2, s.r * 2);
      }
      // Um toque quente no que a luz alcança.
      ctx.globalCompositeOperation = 'source-over';
      for (const s of sources) {
        const g = ctx.createRadialGradient(s.x, s.y + WALL_H, 0, s.x, s.y + WALL_H, s.r * 0.8);
        g.addColorStop(0, 'rgba(255, 150, 60, 0.2)');
        g.addColorStop(1, 'rgba(255, 150, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - s.r, s.y + WALL_H - s.r, s.r * 2, s.r * 2);
      }
    }
    this.tex.refresh();
  }

  /**
   * Luz de pixel art: quatro degraus com pontilhado entre eles (nada de degradê liso), em blocos de
   * 2×2 pixels, e só onde a luz enxerga (as paredes fazem sombra). Um laranja fraco perto do fogo.
   */
  private paintPixel(sources: LightSource[]): void {
    const { tile, cols } = this.pixel!;
    const dark = this.dark;
    this.image.setVisible(dark > 0);
    const ctx = this.tex.getContext();
    if (dark <= 0) {
      ctx.clearRect(0, 0, this.w, this.h);
      this.tex.refresh();
      return;
    }
    const img = ctx.createImageData(this.w, this.h);
    const d = img.data;
    for (let y = 0; y < this.h; y += 2) {
      // A camada começa WALL_H acima do chão (o topo das paredes da primeira linha).
      const wy = y - WALL_H;
      const ty = Math.floor(wy / tile);
      for (let x = 0; x < this.w; x += 2) {
        const tx = Math.floor(x / tile);
        let base = dark;
        for (const o of this.open) {
          if (x >= o.x && x < o.x + o.w && wy >= o.y && wy < o.y + o.h) base = dark * (1 - o.amount);
        }
        let lit = 0;
        let warm = false;
        for (let i = 0; i < sources.length; i++) {
          const s = sources[i];
          // Acima da primeira linha (topo da parede de fora) nenhuma luz chega.
          if (ty < 0 || !this.seen[i]?.[ty * cols + tx]) continue;
          const k = 1 - Math.hypot(x - s.x, (wy - s.y) * 1.2) / s.r;
          if (k > lit) {
            lit = k;
            warm = !!s.fire;
          }
        }
        // O topo das paredes recebe só metade da luz: senão vira uma faixa clara pontilhada no escuro.
        if (ty >= 0 && this.pixel!.opaque(tx, ty)) lit *= 0.5;
        const level = Math.max(0, Math.min(1, lit * 1.25)) * 4;
        const step = Math.min(4, Math.floor(level) + (level % 1 > BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] ? 1 : 0));
        let r = 4;
        let g = 7;
        let b = 15;
        // Nem perto da chama fica claro como de dia: sobra um pouco da noite.
        let a = base * (1 - (step / 4) * 0.72);
        if (warm && step >= 1) {
          r = 255;
          g = 150;
          b = 60;
          a = Math.max(a * 0.72, 0.1);
        }
        const A = Math.round(255 * a);
        for (let yy = y; yy < Math.min(y + 2, this.h); yy++) {
          for (let xx = x; xx < Math.min(x + 2, this.w); xx++) {
            const i = (yy * this.w + xx) * 4;
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = A;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.tex.refresh();
  }
}

/** Chuva caindo dentro de um retângulo da cena. Começa parada: ligue com start(). */
export function makeRain(scene: Phaser.Scene, x0: number, y0: number, x1: number, y1: number, quantity = 3): Phaser.GameObjects.Particles.ParticleEmitter {
  if (!scene.textures.exists('drop')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xbfd4e6).fillRect(0, 0, 1, 7);
    g.generateTexture('drop', 1, 7);
    g.destroy();
  }
  return scene.add
    .particles(0, 0, 'drop', {
      x: { min: x0, max: x1 },
      y: { min: y0, max: y1 },
      lifespan: 260,
      speedY: { min: 220, max: 300 },
      speedX: -35,
      alpha: { start: 0.55, end: 0 },
      quantity,
      frequency: 30,
      emitting: false,
    })
    .setDepth(90000);
}

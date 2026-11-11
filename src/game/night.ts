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

export class NightLight {
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private last = '';
  private dark = 0;
  private sources: LightSource[] = [];
  private open: OpenArea[] = [];

  constructor(
    scene: Phaser.Scene,
    private w: number,
    private h: number,
  ) {
    const key = 'shelter-light';
    this.tex = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : scene.textures.createCanvas(key, w, h)!;
    this.image = scene.add.image(0, -WALL_H, key).setOrigin(0).setDepth(100000);
  }

  set(dark: number, sources: LightSource[], open: OpenArea[] = []): void {
    const sig = `${dark}|${sources.map((s) => `${s.x},${s.y},${s.r}`).join(';')}|${open.map((o) => `${o.x},${o.y},${o.amount}`).join(';')}`;
    if (sig === this.last) return;
    this.last = sig;
    this.dark = dark;
    this.sources = sources;
    this.open = open;
    this.paint(sources);
  }

  /** A chama treme: os focos mudam um pouco de tamanho. Só trabalha quando está escuro. */
  flicker(): void {
    if (this.dark <= 0) return;
    this.paint(this.sources.map((s) => ({ ...s, r: s.r * (0.96 + Math.random() * 0.08) })));
  }

  private paint(sources: LightSource[]): void {
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

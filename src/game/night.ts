import Phaser from 'phaser';
import { WALL_H } from './oblique';

export interface LightSource {
  x: number;
  y: number;
  r: number;
}

/** A noite: uma camada escura por cima de tudo, furada onde há fogo ou lampião. */
export class NightLight {
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private last = '';
  private dark = 0;
  private sources: LightSource[] = [];

  constructor(
    scene: Phaser.Scene,
    private w: number,
    private h: number,
  ) {
    const key = 'shelter-light';
    this.tex = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : scene.textures.createCanvas(key, w, h)!;
    this.image = scene.add.image(0, -WALL_H, key).setOrigin(0).setDepth(100000);
  }

  set(dark: number, sources: LightSource[]): void {
    const sig = `${dark}|${sources.map((s) => `${s.x},${s.y},${s.r}`).join(';')}`;
    if (sig === this.last) return;
    this.last = sig;
    this.dark = dark;
    this.sources = sources;
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

import Phaser from 'phaser';
import { LOCATIONS } from '../data/shelter';
import { hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState } from '../sim/shelter/types';
import { ensureIcon, iconFor } from './icons';
import { NightLight, makeRain, type LightSource } from './night';
import { TAP_SLOP, TILE, WALL_H, setupObliqueCamera, smoothPainted } from './oblique';
import { CITY_H, CITY_W, LANDMARKS, fogTexture, paintCity, type Landmark } from './pixelCity';
import { Actor, preloadBodies, survivorLook } from './sprites';

const W = CITY_W;
const H = CITY_H;
const DANGER_COLOR = { 1: 0xd9b45b, 2: 0xe69138, 3: 0xe0573a } as const;
/** Placa de cada local: quadrado com o ícone, preso por uma haste ao telhado do prédio. */
const SIGN = 20;
const STEM = 8;

const landmarkOf = (id: string): Landmark => LANDMARKS.find((l) => l.kind === id)!;
/** Ponto da placa: meio do topo do prédio. */
const signAt = (l: Landmark) => ({ x: Math.round((l.x + l.w / 2) * TILE), y: Math.round(l.y * TILE) - 2 });
/** Porta do prédio: de onde saem e aonde chegam as rotas. */
const doorOf = (l: Landmark) => ({ x: Math.round((l.x + l.w / 2) * TILE), y: Math.round((l.y + l.h) * TILE) + 4 });

/** Mapa da cidade em pixel art: quarteirões, rio, prédios dos locais e as rotas das expedições. */
export class RegionScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private gfx!: Phaser.GameObjects.Graphics;
  private routes!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private night!: NightLight;
  /** Área de toque de cada local (o prédio e a placa). */
  private hits: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private onSelect: (id: string) => void = () => {};
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('region');
    this.onReady = onReady;
  }

  setSelectHandler(fn: (id: string) => void): void {
    this.onSelect = fn;
  }

  preload(): void {
    preloadBodies(this);
  }

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.labels = [];
    const home = doorOf(landmarkOf('shelter'));
    // O mapa abre ampliado no mínimo 2× (os detalhes são pequenos), olhando para o abrigo e os locais
    // mais próximos; arrasta para andar e a rodinha aproxima ou afasta.
    setupObliqueCamera(this, W * TILE, H * TILE, { x: home.x + 4 * TILE, y: home.y - 4 * TILE }, 2);
    smoothPainted(this);
    paintCity(this, 'city-map');
    this.add.image(0, -WALL_H, 'city-map').setOrigin(0).setDepth(0);
    this.gfx = this.add.graphics().setDepth(20);
    this.routes = this.add.graphics().setDepth(30);
    this.night = new NightLight(this, W * TILE, H * TILE + WALL_H, { tile: TILE, cols: W, rows: H, opaque: () => false });
    this.rain = makeRain(this, 0, -WALL_H - 40, W * TILE + 40, H * TILE, 8);
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.night.flicker() });
    // Escolhe no soltar, e só se o dedo não arrastou o mapa.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > TAP_SLOP) return;
      const hit = this.hits.find((c) => p.worldX >= c.x0 && p.worldX <= c.x1 && p.worldY >= c.y0 && p.worldY <= c.y1);
      if (hit) this.onSelect(hit.id);
    });
    this.onReady();
  }

  /** Placa em pixel: borda da cor do perigo, fundo escuro e o ícone; haste até o telhado. */
  private sign(l: Landmark, icon: string | null, border: number, selected: boolean): { x: number; y: number } {
    const g = this.gfx;
    const { x, y } = signAt(l);
    const s = SIGN + (selected ? 4 : 0);
    const top = y - STEM - s;
    const left = x - Math.floor(s / 2);
    g.fillStyle(0x111113).fillRect(x - 1, y - STEM - 1, 3, STEM + 1);
    g.fillStyle(border).fillRect(x, y - STEM, 1, STEM);
    g.fillStyle(0x111113, 0.5).fillRect(left + 2, top + 2, s, s);
    g.fillStyle(0x111113).fillRect(left - 1, top - 1, s + 2, s + 2);
    g.fillStyle(selected ? 0xf1ebe0 : border).fillRect(left, top, s, s);
    g.fillStyle(0x1d1c19).fillRect(left + 2, top + 2, s - 4, s - 4);
    if (icon) this.ico(x, top + s / 2, icon, s - 6, 24);
    else this.text(x, top + s / 2, '?', 13, 24, '#8a8474');
    return { x, y: top };
  }

  draw(s: ShelterState, selected: string | null): void {
    const g = this.gfx;
    const r = this.routes;
    g.clear();
    r.clear();
    for (const o of this.labels) o.destroy();
    this.labels = [];
    this.hits = [];
    const shelter = landmarkOf('shelter');
    const home = doorOf(shelter);

    this.sign(shelter, 'home', 0x8fbf5a, false);
    this.label(home.x, home.y - 2, 'Abrigo', '#a9d472');

    for (const l of LOCATIONS) {
      const lm = landmarkOf(l.id);
      const known = s.discovered.includes(l.id);
      const door = doorOf(lm);
      const sa = signAt(lm);
      this.hits.push({ id: l.id, x0: lm.x * TILE - 4, x1: (lm.x + lm.w) * TILE + 4, y0: sa.y - STEM - SIGN - 6, y1: door.y + 20 });
      if (!known) {
        // Ainda não descoberto: o prédio some debaixo da névoa.
        const fw = Math.round(lm.w * TILE) + 28;
        const fh = Math.round(lm.h * TILE) + 24;
        this.labels.push(this.add.image(Math.round((lm.x + lm.w / 2) * TILE), Math.round((lm.y + lm.h / 2) * TILE), fogTexture(this, fw, fh)).setDepth(15));
        this.sign(lm, null, 0x4a463c, false);
        this.label(door.x, door.y - 2, '???', '#8a8474');
        continue;
      }
      const top = this.sign(lm, iconFor(l.icon) ?? 'map', DANGER_COLOR[l.danger], selected === l.id);
      const name = this.label(door.x - l.danger * 5, door.y - 2, l.name, '#f1ebe0');
      for (let i = 0; i < l.danger; i++) this.ico(name.x + name.width / 2 + 8 + i * 11, name.y + 8, 'skull', 11, 28);
      // Quanto ainda há para saquear.
      const stock = (s.locationStock[l.id] ?? 100) / 100;
      const sy = door.y + 15;
      g.fillStyle(0x111113).fillRect(door.x - 23, sy - 1, 46, 6);
      g.fillStyle(0x2a2822).fillRect(door.x - 22, sy, 44, 4);
      g.fillStyle(stock > 0.5 ? 0x8fbf5a : stock > 0.25 ? 0xe0a83a : 0xe0573a).fillRect(door.x - 22, sy, Math.round(44 * stock), 4);

      if (s.expeditions.some((e) => e.locationId === l.id && e.emergency?.state === 'pending')) {
        const ring = this.add.rectangle(top.x, top.y + SIGN / 2, SIGN + 12, SIGN + 12).setStrokeStyle(2, 0xe0573a).setDepth(26);
        this.tweens.add({ targets: ring, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: 900, repeat: -1 });
        this.labels.push(ring);
        this.ico(top.x + SIGN / 2 + 4, top.y - 2, 'siren', 16, 27);
      }
    }

    const walkers: LightSource[] = [];
    const sites: LightSource[] = [];
    // Rotas das expedições por cima dos prédios
    for (const e of s.expeditions) {
      const to = doorOf(landmarkOf(e.locationId));
      const color = e.emergency?.state === 'pending' ? 0xe0573a : 0xd9b45b;
      dashed(r, home.x, home.y, to.x, to.y, color, e.departed ? 1 : 0.5);
      if (!e.departed) continue;
      sites.push({ x: to.x, y: to.y - 6, r: 70 });
      // Primeiro quarto da noite indo, último quarto voltando; no meio, no local.
      const t = Phaser.Math.Clamp((s.hour - e.departHour) / Math.max(1, e.returnHour - e.departHour), 0, 1);
      const k = e.emergency ? 1 : t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
      const members = s.survivors.filter((v) => v.expeditionId === e.id);
      const at = { x: home.x + (to.x - home.x) * k, y: home.y + (to.y - home.y) * k };
      // A lanterna do grupo: à noite é o que se vê deles no caminho.
      if (members.length) walkers.push({ x: at.x + 6, y: at.y - 14, r: 58 });
      members.forEach((v, i) => {
        const a = new Actor(this, survivorLook(v.id));
        a.container.setPosition(Math.round(at.x + i * 13 - ((members.length - 1) * 13) / 2), Math.round(at.y)).setDepth(31);
        if (k < 1) {
          const dir = t < 0.5 ? 1 : -1;
          a.faceDelta((to.x - home.x) * dir, (to.y - home.y) * dir);
          a.setWalking(true);
        }
        this.labels.push(a.container);
      });
    }

    // À noite só se vê o abrigo e onde há gente de lanterna.
    const hr = hourOfDay(s.hour);
    const sc = signAt(shelter);
    const lights: LightSource[] = [{ x: sc.x, y: sc.y + 30, r: 105 }, ...walkers, ...sites];
    this.night.set(isNight(hr) ? 0.66 : hr === 20 || hr === 6 ? 0.36 : 0.12, lights);
    if (this.rain.emitting !== s.raining) s.raining ? this.rain.start() : this.rain.stop();
  }

  private ico(x: number, y: number, name: string, size: number, depth: number): void {
    this.labels.push(this.add.image(Math.round(x), Math.round(y), ensureIcon(this, name)).setDisplaySize(size, size).setDepth(depth));
  }

  private text(x: number, y: number, t: string, size: number, depth: number, color = '#f1ebe0'): void {
    this.labels.push(
      this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth),
    );
  }

  private label(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: '"Pixelify Sans", monospace', fontSize: '11px', color, stroke: '#0b0a08', strokeThickness: 4 })
      .setOrigin(0.5, 0)
      .setDepth(28);
    this.labels.push(t);
    return t;
  }
}

/** Rota tracejada em pixels: traços de 6 px com 4 de folga, sem serrilhar. */
function dashed(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.fillStyle(color, alpha);
  for (let d = 0; d < len; d += 1) {
    if (d % 10 >= 6) continue;
    const x = Math.round(x0 + ((x1 - x0) * d) / len);
    const y = Math.round(y0 + ((y1 - y0) * d) / len);
    g.fillRect(x - 1, y - 1, 2, 2);
  }
}

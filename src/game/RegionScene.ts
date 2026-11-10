import Phaser from 'phaser';
import { LOCATIONS, SHELTER_POS } from '../data/shelter';
import { hourOfDay, isNight } from '../sim/shelter/core';
import type { ShelterState } from '../sim/shelter/types';
import { artUrl } from './art';
import { ensureIcon, iconFor } from './icons';
import { NightLight, makeRain, type LightSource } from './night';
import { TAP_SLOP, TILE, WALL_H, enablePan, setupObliqueCamera } from './oblique';
import { Actor, survivorLook } from './sprites';

const W = 28;
const H = 20;
const DANGER_COLOR = { 1: 0xd9b45b, 2: 0xe69138, 3: 0xe0573a } as const;
/** Cartão de cada local: uma foto pequena presa no ponto do mapa. */
const CARD_W = 70;
const CARD_H = 40;
/** Do ponto no chão até a base do cartão. */
const STEM = 14;
const PLACES = ['market', 'garage', 'pharmacy', 'hospital', 'police'];

/**
 * A pintura do mapa foi feita sobre uma captura da tela com um pouco de margem em volta
 * do jogo; estes números encaixam a imagem de volta na grade.
 */
const MAP_FIT = { x: -40, y: -WALL_H - 3, w: 832, h: 592 };

const center = (p: [number, number]) => ({ x: p[0] * TILE + TILE / 2, y: p[1] * TILE + TILE / 2 });

/** Mapa da cidade em 3/4: quarteirões, rio, prédios dos locais e as rotas das expedições. */
export class RegionScene extends Phaser.Scene {
  /** Verdadeiro entre o create() e o shutdown da cena: só então dá para desenhar. */
  ready = false;

  private gfx!: Phaser.GameObjects.Graphics;
  private routes!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.GameObject[] = [];
  private night!: NightLight;
  /** Onde cada cartão foi desenhado, para saber em qual o dedo tocou. */
  private hits: { id: string; x: number; y: number }[] = [];
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
    if (!this.textures.exists('region-map')) this.load.image('region-map', artUrl('region-map'));
    for (const id of [...PLACES, 'title']) if (!this.textures.exists(`place-${id}`)) this.load.image(`place-${id}`, artUrl(id));
  }

  create(): void {
    this.ready = true;
    this.events.once('shutdown', () => (this.ready = false));
    this.labels = [];
    setupObliqueCamera(this);
    // No celular começa olhando para o abrigo e os locais mais próximos.
    enablePan(this, W * TILE, H * TILE, { x: (SHELTER_POS[0] + 3) * TILE, y: (SHELTER_POS[1] - 4) * TILE });
    this.drawCity();
    this.gfx = this.add.graphics().setDepth(20);
    this.routes = this.add.graphics().setDepth(30);
    this.night = new NightLight(this, W * TILE, H * TILE + WALL_H);
    this.rain = makeRain(this, 0, -WALL_H - 40, W * TILE + 40, H * TILE, 8);
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.night.flicker() });
    // Escolhe no soltar, e só se o dedo não arrastou o mapa.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > TAP_SLOP) return;
      const hit = this.hits.find((c) => Math.abs(p.worldX - c.x) <= CARD_W / 2 + 4 && p.worldY >= c.y - STEM - CARD_H - 4 && p.worldY <= c.y + 24);
      if (hit) this.onSelect(hit.id);
    });
    this.onReady();
  }

  /** A cidade é uma pintura só (npm run art -- region-map), com as bordas escurecidas. */
  private drawCity(): void {
    const PW = W * TILE;
    const PH = H * TILE;
    this.add.rectangle(0, -WALL_H, PW, PH + WALL_H, 0x121210).setOrigin(0).setDepth(0);
    this.add.image(MAP_FIT.x, MAP_FIT.y, 'region-map').setOrigin(0).setDisplaySize(MAP_FIT.w, MAP_FIT.h).setDepth(1);
    if (!this.textures.exists('region-vignette')) {
      const tex = this.textures.createCanvas('region-vignette', PW, PH + WALL_H)!;
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.45, PW / 2, PH / 2, PW * 0.7);
      grad.addColorStop(0, 'rgba(6, 6, 7, 0)');
      grad.addColorStop(1, 'rgba(6, 6, 7, 0.6)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, PW, PH + WALL_H);
      tex.refresh();
    }
    this.add.image(0, -WALL_H, 'region-vignette').setOrigin(0).setDepth(5);
  }

  /** Cartão com a foto do lugar, preso por uma haste ao ponto do mapa. */
  private card(x: number, y: number, art: string | null, border: number, selected: boolean): void {
    const g = this.gfx;
    const top = y - STEM - CARD_H;
    const w = CARD_W + (selected ? 6 : 0);
    const h = CARD_H + (selected ? 4 : 0);
    const cy = top + CARD_H / 2;
    // Ponto no chão, haste e sombra do cartão.
    g.fillStyle(0x000000, 0.45).fillEllipse(x + 2, y + 2, 14, 6);
    g.fillStyle(border).fillCircle(x, y, 3.5);
    g.lineStyle(2, 0x0f0e0c).lineBetween(x, y, x, top + CARD_H);
    g.lineStyle(1, border).lineBetween(x, y - 3, x, top + CARD_H);
    g.fillStyle(0x000000, 0.45).fillRect(x - w / 2 + 3, cy - h / 2 + 3, w, h);
    g.fillStyle(0x0f0e0c).fillRect(x - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2);
    g.fillStyle(selected ? 0xf1ebe0 : border).fillRect(x - w / 2, cy - h / 2, w, h);
    if (art) {
      this.labels.push(this.add.image(x, cy, art).setDisplaySize(w - 4, h - 4).setDepth(24));
    } else {
      this.labels.push(this.add.rectangle(x, cy, w - 4, h - 4, 0x16150f).setDepth(24));
      this.text(x, cy, '?', 18, 25, '#6a6355');
    }
  }

  draw(s: ShelterState, selected: string | null): void {
    const g = this.gfx;
    const r = this.routes;
    g.clear();
    r.clear();
    for (const o of this.labels) o.destroy();
    this.labels = [];
    const home = center(SHELTER_POS);

    this.hits = [];

    // Abrigo
    this.card(home.x, home.y, 'place-title', 0x8fbf5a, false);
    this.ico(home.x - CARD_W / 2 + 2, home.y - STEM - CARD_H + 2, 'home', 16, 26);
    this.label(home.x, home.y + 7, 'Abrigo', '#a9d472');

    for (const l of LOCATIONS) {
      const at = center(l.pos);
      const known = s.discovered.includes(l.id);
      this.hits.push({ id: l.id, x: at.x, y: at.y });
      if (!known) {
        this.card(at.x, at.y, null, 0x4a463c, false);
        this.label(at.x, at.y + 7, '???', '#8a8474');
        continue;
      }
      const top = at.y - STEM - CARD_H;
      this.card(at.x, at.y, `place-${l.id}`, DANGER_COLOR[l.danger], selected === l.id);
      this.ico(at.x - CARD_W / 2 + 2, top + 2, iconFor(l.icon) ?? 'map', 16, 26);
      const name = this.label(at.x - l.danger * 5, at.y + 7, l.name, '#f1ebe0');
      for (let i = 0; i < l.danger; i++) this.ico(name.x + name.width / 2 + 8 + i * 11, name.y + 8, 'skull', 11, 28);
      // Quanto ainda há para saquear.
      const stock = (s.locationStock[l.id] ?? 100) / 100;
      const sy = at.y + 25;
      g.fillStyle(0x0f0e0c).fillRect(at.x - 23, sy - 1, 46, 6);
      g.fillStyle(0x2a2822).fillRect(at.x - 22, sy, 44, 4);
      g.fillStyle(stock > 0.5 ? 0x8fbf5a : stock > 0.25 ? 0xe0a83a : 0xe0573a).fillRect(at.x - 22, sy, 44 * stock, 4);

      if (s.expeditions.some((e) => e.locationId === l.id && e.emergency?.state === 'pending')) {
        const ring = this.add.ellipse(at.x, top + CARD_H / 2, CARD_W + 14, CARD_H + 14).setStrokeStyle(3, 0xe0573a).setDepth(26);
        this.tweens.add({ targets: ring, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 900, repeat: -1 });
        this.labels.push(ring);
        this.ico(at.x + CARD_W / 2 - 2, top - 2, 'siren', 18, 27);
      }
    }

    // Rotas das expedições por cima dos prédios
    for (const e of s.expeditions) {
      const l = LOCATIONS.find((x) => x.id === e.locationId)!;
      const to = center(l.pos);
      const color = e.emergency?.state === 'pending' ? 0xe0573a : 0xd9b45b;
      dashed(r, home.x, home.y, to.x, to.y, color, e.departed ? 1 : 0.5);
      if (e.departed) {
        // Primeiro quarto da noite indo, último quarto voltando; no meio, no local.
        const t = Phaser.Math.Clamp((s.hour - e.departHour) / Math.max(1, e.returnHour - e.departHour), 0, 1);
        const k = e.emergency ? 1 : t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
        const site = { x: to.x + TILE * 1.9, y: to.y + 10 };
        const members = s.survivors.filter((v) => v.expeditionId === e.id);
        members.forEach((v, i) => {
          const a = new Actor(this, survivorLook(v.id));
          a.container.setPosition(home.x + (site.x - home.x) * k + i * 13, home.y + 10 + (site.y - home.y - 10) * k).setDepth(31);
          if (k < 1) {
            const dir = t < 0.5 ? 1 : -1;
            a.faceDelta((site.x - home.x) * dir, (site.y - home.y) * dir);
            a.setWalking(true);
          }
          this.labels.push(a.container);
        });
      }
    }

    // À noite só se vê o abrigo e onde há gente de lanterna.
    const hr = hourOfDay(s.hour);
    const lights: LightSource[] = [{ x: home.x, y: home.y + 6, r: 105 }];
    for (const e of s.expeditions) {
      if (!e.departed) continue;
      const to = center(LOCATIONS.find((x) => x.id === e.locationId)!.pos);
      lights.push({ x: to.x + TILE, y: to.y + 6, r: 80 });
    }
    this.night.set(isNight(hr) ? 0.62 : hr === 20 || hr === 6 ? 0.32 : 0, lights);
    if (this.rain.emitting !== s.raining) s.raining ? this.rain.start() : this.rain.stop();
  }

  private ico(x: number, y: number, name: string, size: number, depth: number): void {
    this.labels.push(this.add.image(x, y, ensureIcon(this, name)).setDisplaySize(size, size).setDepth(depth));
  }

  private text(x: number, y: number, t: string, size: number, depth: number, color = '#f1ebe0'): void {
    this.labels.push(
      this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth),
    );
  }

  private label(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, text, { fontFamily: '"Special Elite", monospace', fontSize: '11px', color, stroke: '#0b0a08', strokeThickness: 4 })
      .setOrigin(0.5, 0)
      .setDepth(28);
    this.labels.push(t);
    return t;
  }
}

function dashed(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.floor(len / 10);
  g.lineStyle(3, color, alpha);
  for (let i = 0; i < steps; i += 2) {
    const a = i / steps;
    const b = Math.min(1, (i + 1) / steps);
    g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
}

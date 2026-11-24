import Phaser from 'phaser';
import { idx, isOpaque } from '../sim/raid/grid';
import { computeVisible, exitStatus } from '../sim/raid/raid';
import type { RaidState, Tile, Vec } from '../sim/raid/types';
import { NightLight, type LightSource } from './night';
import { RARITY_INFO } from '../data/items';
import { LOCATIONS } from '../data/shelter';
import { bestRarity } from '../sim/raid/loot';
import { TILE, WALL_H, cameraZoom, feet, rowDepth, sharpText, smoothPainted } from './oblique';
import { PAL, footShadow, paintHouse, type FloorKind } from './pixelHouse';
import { Actor, preloadBodies, survivorLook, zombieLook } from './sprites';

export { TILE } from './oblique';

/** Sprite de pixel de cada móvel (public/pixel/raid); armário e cofre são desenhados por código. */
const CONTAINER_SPRITE: Record<string, string> = {
  Prateleira: 'raid-shelf',
  Balcão: 'raid-table',
  'Caixa de ferramentas': 'raid-crates',
};

/** Piso de cada local: azulejo no comércio e no hospital, cimento na oficina e na delegacia. */
const FLOOR_BY_PLACE: Record<string, FloorKind> = { market: 'tile', garage: 'concrete', pharmacy: 'tile', hospital: 'tile', police: 'concrete' };

/** Desenha o estado da incursão em 3/4. Não guarda regras: só lê o estado e repassa cliques. */
export class RaidScene extends Phaser.Scene {
  /** Portas e saídas, por linha (mudam a cada turno). */
  private rows: Phaser.GameObjects.Graphics[] = [];
  /** Névoa: o que nunca foi visto some; o que está fora de vista escurece. */
  private fog: Phaser.GameObjects.Graphics[] = [];
  /** Pontos de "ainda não vasculhado" e "tem coisa" em cima dos móveis. */
  private marks!: Phaser.GameObjects.Graphics;
  private props = new Map<number, Phaser.GameObjects.Image>();
  /** Semente da incursão cuja casa já foi pintada. */
  private built: number | null = null;
  private player: Actor | null = null;
  private playerId = 'marta';
  private zombies = new Map<number, Actor>();
  private alerts = new Map<number, Phaser.GameObjects.Text>();
  private dark: NightLight | null = null;
  private state: RaidState | null = null;
  private onTileClick: (p: Vec) => void = () => {};
  private onReady: () => void;

  constructor(onReady: () => void) {
    super('raid');
    this.onReady = onReady;
  }

  preload(): void {
    preloadBodies(this);
    for (const k of ['shelf', 'table', 'crates']) if (!this.textures.exists(`raid-${k}`)) this.load.image(`raid-${k}`, `pixel/raid/${k}.png`);
  }

  create(): void {
    sharpText(this);
    smoothPainted(this);
    this.player = null;
    this.zombies.clear();
    this.alerts.clear();
    this.rows = [];
    this.fog = [];
    this.props.clear();
    this.built = null;
    this.marks = this.add.graphics().setDepth(1);
    this.dark = null;
    this.time.addEvent({ delay: 170, loop: true, callback: () => this.dark?.flicker() });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.onTileClick({ x: Math.floor(p.worldX / TILE), y: Math.floor(p.worldY / TILE) });
    });
    this.onReady();
  }

  /** Quem está na incursão: define o visual do boneco. */
  setPlayer(id: string): void {
    this.playerId = id;
  }

  setTileClickHandler(fn: (p: Vec) => void): void {
    this.onTileClick = fn;
  }

  /**
   * Parte fixa, pintada uma vez por incursão: chão e paredes em pixel (pixelHouse.ts), as paredes em
   * faixas por linha para os bonecos passarem atrás, e um sprite por móvel com a sombra dele.
   */
  private build(s: RaidState): void {
    this.built = s.seed;
    const place = LOCATIONS.find((l) => l.name === s.site)?.id ?? 'market';
    const floor = FLOOR_BY_PLACE[place] ?? 'tile';
    const entry = s.exits.find((e) => e.id === 'entry');
    const wallAt = (x: number, y: number) => {
      const t = s.tiles[idx(s, x, y)];
      return t.kind === 'wall' || (t.kind === 'exit' && t.exitId === 'window');
    };
    paintHouse(this, 'raid-house', {
      cols: s.width,
      rows: s.height,
      isWall: wallAt,
      // O piso do local, com cimento nas passagens das portas.
      floorOf: (x, y) => (s.tiles[idx(s, x, y)].kind === 'door' ? 'concrete' : floor),
      door: entry ? [entry.pos.x, entry.pos.y] : undefined,
    });
    this.add.image(0, -WALL_H, 'raid-house-floor').setOrigin(0).setDepth(0);
    const solid = (x: number, y: number) => x >= 0 && x < s.width && y >= 0 && y < s.height && (wallAt(x, y) || (entry?.pos.x === x && entry.pos.y === y));
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (!solid(x, y)) continue;
        const front = !(y + 1 < s.height && wallAt(x, y + 1));
        let end = x;
        while (solid(end + 1, y) && !(y + 1 < s.height && wallAt(end + 1, y + 1)) === front) end++;
        this.add.image(0, -WALL_H, 'raid-house-walls').setOrigin(0).setCrop(x * TILE, y * TILE, (end - x + 1) * TILE, TILE + (front ? WALL_H : 0)).setDepth(rowDepth(y, 5));
        x = end;
      }
    }
    for (const c of s.containers) {
      const key = c.locked ? null : CONTAINER_SPRITE[c.name];
      if (!key) continue;
      const cx = c.pos.x * TILE + TILE / 2;
      const bottom = c.pos.y * TILE + TILE - 3;
      const img = this.add.image(cx, bottom, key).setOrigin(0.5, 1).setDepth(rowDepth(c.pos.y, 6));
      this.add.image(Math.round(cx - img.width / 2) - 1, bottom - img.height, footShadow(this, key, 0.4)).setOrigin(0).setDepth(1);
      this.props.set(c.id, img);
    }
  }

  draw(s: RaidState): void {
    if (this.built !== s.seed) this.build(s);
    while (this.rows.length < s.height) {
      this.rows.push(this.add.graphics().setDepth(rowDepth(this.rows.length, 5.5)));
      this.fog.push(this.add.graphics().setDepth(rowDepth(this.fog.length, 6.5)));
    }
    for (const g of this.rows) g.clear();
    for (const g of this.fog) g.clear();
    const m = this.marks.clear().setDepth(rowDepth(0, 6.2));
    const vis = computeVisible(s);
    // Só no dev: `&revelar` mostra o prédio inteiro (para capturas de tela).
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('revelar')) {
      s.seen.fill(true);
      vis.fill(true);
    }
    const rect = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string | number, a = 1) =>
      g.fillStyle(typeof c === 'string' ? Phaser.Display.Color.HexStringToColor(c).color : c, a).fillRect(x, y, w, h);
    const tall = (t: Tile | undefined) => !!t && (t.kind === 'wall' || (t.kind === 'door' && (t.door === 'closed' || t.door === 'locked')));

    for (let y = 0; y < s.height; y++) {
      const g = this.rows[y];
      const fog = this.fog[y];
      for (let x = 0; x < s.width; x++) {
        const i = idx(s, x, y);
        const px = x * TILE;
        const py = y * TILE;
        const t = s.tiles[i];
        const raised = tall(t) || t.containerId !== undefined || (t.kind === 'exit' && t.exitId !== 'entry');
        if (!s.seen[i]) {
          rect(fog, px, py - (raised ? WALL_H + 20 : 0), TILE, TILE + (raised ? WALL_H + 20 : 0), PAL.ink);
          continue;
        }
        if (t.kind === 'door') this.door(g, px, py, t.door ?? 'closed', rect);
        else if (t.kind === 'exit') this.exit(g, s, px, py, t.exitId ?? '', rect);
        if (t.containerId !== undefined) {
          const c = s.containers[t.containerId];
          const empty = c.searched && c.items.length === 0;
          const img = this.props.get(c.id);
          if (img) img.setTint(empty ? 0x6a655c : 0xffffff);
          else if (c.locked) this.vault(g, px, py, rect);
          else this.locker(g, px, py, empty, rect);
          // Ponto claro: ainda não vasculhado. Depois, a cor da melhor raridade que sobrou.
          const dotY = py - 6;
          if (!c.searched && !c.locked) {
            rect(m, px + 12, dotY, 4, 4, PAL.ink);
            rect(m, px + 13, dotY + 1, 2, 2, '#d6cfc1');
          } else if (c.searched && c.items.length) {
            // Já vasculhado e com coisa: o ponto brilha na cor da melhor raridade que sobrou.
            const best = bestRarity(c.items);
            const color = best && best !== 'comum' ? RARITY_INFO[best].color : '#f1ebe0';
            rect(m, px + 11, dotY - 1, 6, 6, PAL.ink);
            rect(m, px + 12, dotY, 4, 4, color);
            if (best === 'lendario' || best === 'raro') rect(m, px + 13, dotY - 3, 2, 2, color);
          }
        }
        if (!vis[i]) rect(fog, px, py - (raised ? WALL_H + 20 : 0), TILE, TILE + (raised ? WALL_H + 20 : 0), 0x000000, 0.42);
      }
    }

    this.drawActors(s, vis);
    this.rippleNoises(s, vis);

    // Lá dentro é escuro: a lanterna ilumina em volta de quem entrou, e as saídas abertas deixam luz passar.
    this.dark ??= new NightLight(this, s.width * TILE, s.height * TILE + WALL_H, {
      tile: TILE,
      cols: s.width,
      rows: s.height,
      opaque: (tx, ty) => isOpaque(this.state!.tiles[idx(this.state!, tx, ty)]),
    });
    this.state = s;
    const me = feet(s.player.x, s.player.y);
    const lights: LightSource[] = [{ x: me.x, y: me.y - 8, r: 165 }];
    for (const e of s.exits) if (exitStatus(s, e.id) === 'open') lights.push({ x: e.pos.x * TILE + TILE / 2, y: e.pos.y * TILE + TILE / 2, r: 60 });
    // As portas mudam as sombras: a assinatura leva o estado delas.
    const doors = s.tiles.reduce((acc, t, i) => (t.kind === 'door' && isOpaque(t) ? acc + i + ',' : acc), '');
    this.dark.set(0.6, lights, [], doors);
  }

  /** Porta em pixel: fechada é uma folha de tábuas na altura da parede; aberta deixa só os batentes. */
  private door(g: Phaser.GameObjects.Graphics, px: number, py: number, state: string, rect: (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string | number, a?: number) => void): void {
    const top = py - WALL_H;
    if (state === 'closed' || state === 'locked') {
      rect(g, px, top, TILE, TILE + WALL_H, PAL.ink);
      rect(g, px + 1, top + 1, TILE - 2, TILE - 2, PAL.wood1);
      rect(g, px + 1, top + 1, TILE - 2, 1, PAL.wood3);
      const face = py + TILE - WALL_H - 6;
      rect(g, px + 2, face, TILE - 4, WALL_H + 6, state === 'locked' ? '#5e3322' : PAL.wood2);
      for (let k = 0; k < 4; k++) rect(g, px + 2 + k * 6, face, 1, WALL_H + 6, PAL.wood0);
      rect(g, px + 2, face + 4, TILE - 4, 1, PAL.wood0);
      rect(g, px + 2, face + WALL_H, TILE - 4, 1, PAL.wood0);
      if (state === 'locked') {
        // Cadeado.
        rect(g, px + 12, face + 6, 5, 4, '#c9a54a');
        rect(g, px + 13, face + 4, 3, 2, '#8a8477');
        rect(g, px + 14, face + 7, 1, 2, PAL.ink);
      } else rect(g, px + TILE - 8, face + 9, 2, 2, '#c9a54a');
      return;
    }
    // Batentes dos dois lados.
    for (const bx of [px, px + TILE - 3]) {
      rect(g, bx, top, 3, TILE + WALL_H, PAL.wood0);
      rect(g, bx, top, 1, TILE + WALL_H, PAL.wood2);
    }
    if (state === 'broken') {
      // Lascas da porta no chão.
      rect(g, px + 5, py + 16, 9, 3, PAL.wood2);
      rect(g, px + 15, py + 20, 7, 2, PAL.wood1);
      rect(g, px + 8, py + 22, 3, 2, PAL.wood3);
    }
  }

  /** Escada do telhado e janela quebrada; a entrada já vem pintada como porta na parede de baixo. */
  private exit(g: Phaser.GameObjects.Graphics, s: RaidState, px: number, py: number, id: string, rect: (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string | number, a?: number) => void): void {
    const open = exitStatus(s, id) === 'open';
    if (id === 'roof') {
      const rail = open ? '#9a948a' : '#5e5b55';
      rect(g, px + 7, py + 23, 16, 3, 0x111113, 0.4);
      for (const rx of [px + 6, px + TILE - 9]) {
        rect(g, rx, py - 22, 3, 46, PAL.ink);
        rect(g, rx + 1, py - 21, 1, 44, rail);
      }
      for (let k = 0; k < 7; k++) rect(g, px + 7, py + 18 - k * 6, TILE - 14, 2, rail);
      if (!open) for (let k = 0; k < 3; k++) rect(g, px + 4 + k * 8, py + 4 + k * 5, 6, 2, PAL.rust);
      return;
    }
    if (id === 'window') {
      // Vidro quebrado na face da parede de cima, com cacos.
      const fy = py + TILE - WALL_H;
      rect(g, px + 5, fy + 1, TILE - 10, WALL_H - 4, PAL.ink);
      rect(g, px + 6, fy + 2, TILE - 12, WALL_H - 6, open ? '#6f8288' : '#3a3c40');
      rect(g, px + 6, fy + 2, 4, 3, '#a9bcc0');
      rect(g, px + TILE - 11, fy + WALL_H - 7, 5, 2, '#a9bcc0');
      rect(g, px + 13, fy + 2, 1, WALL_H - 6, PAL.ink);
    }
  }

  /** Armário de aço amassado, de pé. */
  private locker(g: Phaser.GameObjects.Graphics, px: number, py: number, empty: boolean, rect: (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string | number, a?: number) => void): void {
    const x = px + 5;
    const top = py - 12;
    const body = empty ? '#4a4c50' : '#5d6670';
    rect(g, x + 3, py + 22, 18, 3, 0x111113, 0.45);
    rect(g, x - 1, top - 1, 20, 37, PAL.ink);
    rect(g, x, top, 18, 8, '#717b85');
    rect(g, x, top + 8, 18, 27, body);
    rect(g, x + 9, top + 8, 1, 27, PAL.ink);
    for (let k = 0; k < 3; k++) rect(g, x + 2, top + 11 + k * 2, 5, 1, PAL.ink);
    rect(g, x + 11, top + 18, 1, 3, '#b7b1a4');
    rect(g, x + 7, top + 18, 1, 3, '#b7b1a4');
    rect(g, x + 13, top + 26, 3, 2, PAL.rust);
  }

  /** O prêmio trancado: cofre de aço com a roda dourada. */
  private vault(g: Phaser.GameObjects.Graphics, px: number, py: number, rect: (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, c: string | number, a?: number) => void): void {
    const x = px + 3;
    const top = py - 6;
    rect(g, x + 3, py + 22, 24, 3, 0x111113, 0.45);
    rect(g, x - 1, top - 1, 24, 31, PAL.ink);
    rect(g, x, top, 22, 8, '#5d6268');
    rect(g, x, top + 8, 22, 21, '#3f4348');
    rect(g, x + 2, top + 10, 18, 17, '#4b5056');
    rect(g, x, top, 22, 1, '#7d838a');
    // Roda e fechadura.
    rect(g, x + 8, top + 15, 6, 6, '#c9a54a');
    rect(g, x + 10, top + 17, 2, 2, PAL.ink);
    rect(g, x + 17, top + 17, 2, 3, '#c9a54a');
    // Um brilho em cima para chamar o olho.
    rect(g, x + 10, top - 6, 2, 2, '#e8c65e');
  }

  private drawActors(s: RaidState, vis: boolean[]): void {
    if (!this.player) {
      this.player = new Actor(this, survivorLook(this.playerId));
      const p = feet(s.player.x, s.player.y);
      this.player.container.setPosition(p.x, p.y);
      // Câmera próxima, seguindo o sobrevivente: a névoa esconde o resto mesmo. Ampliação inteira.
      const whole = import.meta.env.DEV && new URLSearchParams(location.search).has('revelar');
      const fit = () => this.cameras.main.setZoom(cameraZoom(this, s.width * TILE, s.height * TILE, whole ? 1 : 1.7));
      this.cameras.main
        .setBounds(0, -WALL_H, s.width * TILE, s.height * TILE + WALL_H)
        .setOrigin(0.5, 0.5)
        .startFollow(this.player.container, true, 0.12, 0.12, 0, 10);
      fit();
      this.scale.on('resize', fit);
      this.events.once('shutdown', () => this.scale.off('resize', fit));
    }
    this.moveTo(this.player, s.player);
    if (s.status === 'dead') {
      this.player.setPose('floor');
      this.player.container.setAlpha(0.7);
    }

    for (const [id, c] of this.zombies) {
      if (!s.zombies.some((z) => z.id === id)) {
        c.container.destroy();
        this.zombies.delete(id);
        this.alerts.delete(id);
      }
    }
    for (const z of s.zombies) {
      let c = this.zombies.get(z.id);
      if (!c) {
        c = new Actor(this, zombieLook(z.kind));
        const alert = this.add.text(0, -44, '!', { fontFamily: 'monospace', fontSize: '14px', color: '#e0573a', fontStyle: 'bold' }).setOrigin(0.5);
        c.container.add(alert);
        this.alerts.set(z.id, alert);
        const p = feet(z.pos.x, z.pos.y);
        c.container.setPosition(p.x, p.y);
        this.zombies.set(z.id, c);
      }
      c.container.setVisible(vis[idx(s, z.pos.x, z.pos.y)]);
      this.alerts.get(z.id)!.setVisible(z.state === 'chasing');
      this.moveTo(c, z.pos);
    }
  }

  private moveTo(a: Actor, pos: Vec): void {
    const c = a.container;
    const p = feet(pos.x, pos.y);
    c.setDepth(rowDepth(pos.y, 7));
    if (c.x === p.x && c.y === p.y) return;
    this.tweens.killTweensOf(c);
    a.faceDelta(p.x - c.x, p.y - c.y);
    a.setWalking(true);
    this.tweens.add({ targets: c, x: p.x, y: p.y, duration: 140, ease: 'Linear', onComplete: () => a.setWalking(false) });
  }

  /** Ondas de ruído achatadas pela perspectiva. */
  private rippleNoises(s: RaidState, vis: boolean[]): void {
    for (const n of s.lastNoises) {
      if (!s.seen[idx(s, n.pos.x, n.pos.y)] && !vis[idx(s, n.pos.x, n.pos.y)]) continue;
      const p = feet(n.pos.x, n.pos.y);
      const ring = this.add.ellipse(p.x, p.y, TILE, TILE * 0.6).setStrokeStyle(2, 0xe0a83a, 0.85).setDepth(100000);
      this.tweens.addCounter({
        from: 1,
        to: n.radius * 2,
        duration: 450 + n.radius * 60,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 1;
          ring.setSize(TILE * k, TILE * 0.6 * k).setPosition(p.x, p.y);
          ring.setAlpha(1 - tw.progress);
        },
        onComplete: () => ring.destroy(),
      });
    }
  }
}

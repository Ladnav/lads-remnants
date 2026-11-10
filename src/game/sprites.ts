import Phaser from 'phaser';
import type { ZombieKind } from '../data/zombies';
import { shade } from './oblique';

/**
 * Personagens em pixel art, gerados por código (sem arquivos de imagem): cada visual
 * vira uma textura com quadros de frente, costas e lado, parado e andando.
 * A grade lógica é pequena e cada pixel lógico vira PX×PX na tela.
 */
const GW = 16;
const GH = 20;
const PX = 2;
const OX = 2;
const OY = 1;
const OUTLINE = 0x15120e;

export const FRAME_W = GW * PX;
export const FRAME_H = GH * PX;

export type Facing = 'down' | 'up' | 'left' | 'right';
type Hair = 'short' | 'long' | 'cap' | 'bald';
type Build = 'normal' | 'slim' | 'big';

export interface Look {
  key: string;
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  hairStyle: Hair;
  build: Build;
  zombie?: boolean;
}

const SHIRTS = [0xc9a24a, 0x6a9a3a, 0x4f86b8, 0xa65b86, 0xc7782c, 0x7aa86a, 0x8b7bc0, 0xd08a4a];
const SKINS = [0xf1c9a5, 0xc68e62, 0x8d5a3b, 0xe0ac85];
const HAIRS = [0x2b1d14, 0x5a3a20, 0x1a1a1a, 0x8a6a3a, 0xb9b2a6];
const PANTS = [0x2e2b3a, 0x3a3328, 0x2a3a44, 0x40302a];
const STYLES: Hair[] = ['short', 'long', 'cap', 'short', 'long', 'bald'];

/** Quem começa o jogo tem visual fixo; os demais saem do próprio id, sempre o mesmo. */
const FIXED: Record<string, Omit<Look, 'key'>> = {
  marta: { shirt: 0xc9a24a, pants: 0x2a3a44, skin: 0xc68e62, hair: 0x2b1d14, hairStyle: 'long', build: 'normal' },
  iuri: { shirt: 0x4f6f8a, pants: 0x2e2b3a, skin: 0xe0ac85, hair: 0x1a1a1a, hairStyle: 'short', build: 'big' },
  lena: { shirt: 0x6a9a3a, pants: 0x3a3328, skin: 0xf1c9a5, hair: 0x8a4a2a, hairStyle: 'long', build: 'slim' },
  dona_rita: { shirt: 0xa65b86, pants: 0x40302a, skin: 0xe0ac85, hair: 0xb9b2a6, hairStyle: 'short', build: 'normal' },
  caio: { shirt: 0xc7782c, pants: 0x2a3a44, skin: 0x8d5a3b, hair: 0x1a1a1a, hairStyle: 'cap', build: 'slim' },
};

export function survivorLook(id: string): Look {
  const fixed = FIXED[id];
  if (fixed) return { key: `chr-${id}`, ...fixed };
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    key: `chr-${id}`,
    shirt: SHIRTS[h % SHIRTS.length],
    pants: PANTS[(h >> 3) % PANTS.length],
    skin: SKINS[(h >> 5) % SKINS.length],
    hair: HAIRS[(h >> 7) % HAIRS.length],
    hairStyle: STYLES[(h >> 9) % STYLES.length],
    build: 'normal',
  };
}

const ZOMBIE_LOOKS: Record<ZombieKind, Omit<Look, 'key'>> = {
  walker: { shirt: 0x5a5a48, pants: 0x3a3a30, skin: 0x7f9a5c, hair: 0x2a2a20, hairStyle: 'short', build: 'normal', zombie: true },
  runner: { shirt: 0x8a332c, pants: 0x33302a, skin: 0xa9b86a, hair: 0x2a2a20, hairStyle: 'bald', build: 'slim', zombie: true },
  brute: { shirt: 0x343a4a, pants: 0x26262c, skin: 0x5f7a4a, hair: 0x2a2a20, hairStyle: 'bald', build: 'big', zombie: true },
};

export const zombieLook = (kind: ZombieKind): Look => ({ key: `zmb-${kind}`, ...ZOMBIE_LOOKS[kind] });

type Grid = (number | null)[];
type View = 'down' | 'up' | 'side';

function drawFrame(L: Look, view: View, step: 0 | 1 | 2, asleep = false): Grid {
  const grid: Grid = new Array(GW * GH).fill(null);
  const p = (x: number, y: number, w: number, h: number, color: number) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const gx = i + OX;
        const gy = j + OY;
        if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) grid[gy * GW + gx] = color;
      }
    }
  };
  const clear = (x: number, y: number) => (grid[(y + OY) * GW + x + OX] = null);
  const shirtD = shade(L.shirt, 0.72);
  const skinD = shade(L.skin, 0.78);
  const pantsD = shade(L.pants, 0.7);
  const shoe = L.zombie ? shade(L.pants, 0.6) : 0x1c1814;
  const eye = L.zombie ? 0xe0573a : 0x1a1712;
  const grow = L.build === 'big' ? 1 : L.build === 'slim' ? -1 : 0;

  if (view === 'side') {
    // Pernas: paradas juntas; andando, abertas em tesoura.
    if (step === 0) {
      p(4, 13, 4, 4, L.pants);
      p(4, 17, 5, 1, shoe);
    } else {
      const lift = step === 2 ? 1 : 0;
      p(2, 13, 2, 4 - lift, pantsD);
      p(2, 17 - lift, 3, 1, shoe);
      p(4, 13, 4, 1, L.pants);
      p(7, 13, 2, 4 - (1 - lift), L.pants);
      p(7, 17 - (1 - lift), 3, 1, shoe);
    }
    // Tronco
    const sx = grow > 0 ? 2 : 3;
    const sw = grow > 0 ? 8 : grow < 0 ? 5 : 6;
    p(sx, 7, sw, 6, L.shirt);
    p(sx, 12, sw, 1, shirtD);
    if (L.zombie) {
      p(6, 8, 6, 2, L.skin);
      p(11, 8 + (step === 1 ? 1 : 0), 1, 2, skinD);
      p(4, 10, 2, 1, 0x7a1f1a);
    } else {
      const ax = step === 1 ? 6 : step === 2 ? 4 : 5;
      p(ax, 8, 2, 3, shirtD);
      p(ax + (step === 1 ? 1 : step === 2 ? -1 : 0), 11, 2, 1, L.skin);
    }
    // Cabeça virada para a direita
    p(2, 1, 8, 6, L.skin);
    clear(2, 1);
    clear(9, 1);
    clear(2, 6);
    clear(9, 6);
    p(9, 5, 1, 1, skinD);
    if (!asleep) p(8, 4, 1, 1, eye);
    if (L.hairStyle === 'cap') {
      p(2, 0, 8, 3, L.shirt);
      p(8, 3, 3, 1, shirtD);
      clear(2, 0);
    } else if (L.hairStyle !== 'bald') {
      p(3, 0, 6, 1, L.hair);
      p(2, 1, 7, 2, L.hair);
      p(2, 3, L.hairStyle === 'long' ? 3 : 2, L.hairStyle === 'long' ? 5 : 2, L.hair);
    }
    if (L.zombie) p(7, 6, 2, 1, 0x3a1512);
    return outline(grid);
  }

  const back = view === 'up';
  // Pernas
  const liftL = step === 1 ? 1 : 0;
  const liftR = step === 2 ? 1 : 0;
  p(3, 13, 6, 1, L.pants);
  p(3, 13, 2, 4 - liftL, L.pants);
  p(3, 17 - liftL, 2, 1, shoe);
  p(7, 13, 2, 4 - liftR, L.pants);
  p(7, 17 - liftR, 2, 1, shoe);
  if (liftL) p(3, 15, 2, 1, pantsD);
  if (liftR) p(7, 15, 2, 1, pantsD);
  // Tronco
  const tx = 2 - grow;
  const tw = 8 + grow * 2;
  p(tx, 7, tw, 6, L.shirt);
  p(tx + tw - 1, 7, 1, 6, shirtD);
  p(tx, 12, tw, 1, shirtD);
  // Braços
  if (L.zombie) {
    p(tx - 2, 8 + liftL, 2, 2, L.skin);
    p(tx + tw, 8 + liftR, 2, 2, L.skin);
    if (!back) {
      p(tx + 2, 9, 2, 1, 0x7a1f1a);
      p(tx + 3, 10, 2, 1, 0x7a1f1a);
      p(tx + tw - 3, 11, 1, 1, L.skin);
    }
  } else {
    const swing = step === 1 ? -1 : step === 2 ? 1 : 0;
    p(tx - 1, 7, 1, 4 + swing, shirtD);
    p(tx - 1, 11 + swing, 1, 1, L.skin);
    p(tx + tw, 7, 1, 4 - swing, shirtD);
    p(tx + tw, 11 - swing, 1, 1, L.skin);
  }
  // Cabeça
  p(2, 1, 8, 6, L.skin);
  clear(2, 1);
  clear(9, 1);
  clear(2, 6);
  clear(9, 6);
  if (!back) {
    if (asleep) {
      p(3, 4, 2, 1, skinD);
      p(7, 4, 2, 1, skinD);
    } else {
      p(4, 4, 1, 1, eye);
      p(7, 4, 1, 1, eye);
    }
    if (L.zombie) p(5, 6, 2, 1, 0x3a1512);
  }
  if (L.hairStyle === 'cap') {
    p(2, 0, 8, 3, L.shirt);
    clear(2, 0);
    clear(9, 0);
    if (!back) p(2, 3, 8, 1, shirtD);
  } else if (L.hairStyle !== 'bald') {
    p(3, 0, 6, 1, L.hair);
    p(2, 1, 8, back ? 4 : 2, L.hair);
    if (L.hairStyle === 'long') {
      p(2, 3, 1, 5, L.hair);
      p(9, 3, 1, 5, L.hair);
      if (back) p(2, 5, 8, 3, L.hair);
    } else if (back) {
      p(3, 5, 6, 1, L.hair);
    }
    if (!back) p(4, 1, 2, 1, shade(L.hair, 1.25));
  } else if (L.zombie) {
    p(4, 1, 2, 1, skinD);
  }
  return outline(grid);
}

/** Contorno escuro em volta da silhueta: é o que faz o boneco destacar do chão. */
function outline(grid: Grid): Grid {
  const out = grid.slice();
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (grid[y * GW + x] !== null) continue;
      const near =
        (x > 0 && grid[y * GW + x - 1] !== null) ||
        (x < GW - 1 && grid[y * GW + x + 1] !== null) ||
        (y > 0 && grid[(y - 1) * GW + x] !== null) ||
        (y < GH - 1 && grid[(y + 1) * GW + x] !== null);
      if (near) out[y * GW + x] = OUTLINE;
    }
  }
  return out;
}

const VIEWS: View[] = ['down', 'up', 'side'];

/** Cria (uma vez por visual) a textura e as animações de andar. */
export function ensureLook(scene: Phaser.Scene, L: Look): string {
  if (scene.textures.exists(L.key)) return L.key;
  const tex = scene.textures.createCanvas(L.key, FRAME_W * 3, FRAME_H * 4)!;
  const ctx = tex.getContext();
  const blit = (grid: Grid, col: number, row: number, name: string) => {
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      if (c === null) continue;
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
      ctx.fillRect(col * FRAME_W + (i % GW) * PX, row * FRAME_H + Math.floor(i / GW) * PX, PX, PX);
    }
    tex.add(name, 0, col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H);
  };
  VIEWS.forEach((v, row) => {
    for (const step of [0, 1, 2] as const) blit(drawFrame(L, v, step), step, row, `${v}${step}`);
    scene.anims.create({
      key: `${L.key}-${v}`,
      frames: [1, 0, 2, 0].map((n) => ({ key: L.key, frame: `${v}${n}` })),
      frameRate: L.zombie ? 6 : 9,
      repeat: -1,
    });
  });
  blit(drawFrame(L, 'down', 0, true), 0, 3, 'sleep');
  tex.refresh();
  return L.key;
}

export type Pose = 'stand' | 'bed' | 'floor';

/** Um personagem na cena: sombra + sprite, com os pés na origem do container. */
export class Actor {
  readonly container: Phaser.GameObjects.Container;
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Ellipse;
  private key: string;
  private view: View = 'down';
  private walking = false;
  private pose: Pose = 'stand';

  constructor(scene: Phaser.Scene, look: Look) {
    this.key = ensureLook(scene, look);
    this.shadow = scene.add.ellipse(0, 0, look.build === 'big' ? 22 : 18, 6, 0x000000, 0.35);
    this.sprite = scene.add.sprite(0, PX, this.key, 'down0').setOrigin(0.5, 1);
    this.container = scene.add.container(0, 0, [this.shadow, this.sprite]);
  }

  face(dir: Facing): void {
    const view: View = dir === 'left' || dir === 'right' ? 'side' : dir;
    this.sprite.setFlipX(dir === 'left');
    if (view === this.view) return;
    this.view = view;
    this.refresh();
  }

  /** Vira para o lado do deslocamento (dx, dy). */
  faceDelta(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.face(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }

  setWalking(on: boolean): void {
    if (on === this.walking) return;
    this.walking = on;
    this.refresh();
  }

  /** Em pé, deitado na cama (só a cabeça fora do cobertor) ou caído no chão. */
  setPose(pose: Pose): void {
    if (pose === this.pose) return;
    this.pose = pose;
    this.sprite.setCrop().setAngle(0).setPosition(0, PX);
    this.shadow.setVisible(pose === 'stand');
    if (pose === 'bed') this.sprite.setCrop(0, 0, FRAME_W, 20);
    if (pose === 'floor') this.sprite.setAngle(-90).setPosition(FRAME_H / 2 - 4, 0);
    this.refresh();
  }

  private refresh(): void {
    if (this.pose !== 'stand') {
      this.sprite.anims.stop();
      this.sprite.setFlipX(false).setFrame('sleep');
    } else if (this.walking) {
      this.sprite.anims.play(`${this.key}-${this.view}`, true);
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(`${this.view}0`);
    }
  }
}

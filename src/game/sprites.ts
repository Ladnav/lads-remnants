import Phaser from 'phaser';
import type { ZombieKind } from '../data/zombies';
import { artUrl } from './art';
import { shade } from './oblique';

/**
 * Personagens gerados por código (sem arquivos de imagem): cada visual vira uma textura
 * com quadros de frente, costas e lado, parado e andando.
 * O desenho é feito com formas arredondadas (cabeça oval, tronco e membros roliços, com
 * sombra de um lado) numa grade lógica de 16×20, pintada com SS vezes mais pixels do que
 * aparece na tela, para ficar nítida de perto.
 */
const GW = 16;
const GH = 20;
const PX = 2;
const OX = 2;
const OY = 1;
const OUTLINE = '#15120e';
/** Pixels de textura por pixel lógico. */
const SS = 4;
/** Pixels de textura por unidade da grade. */
const U = PX * SS;

export const FRAME_W = GW * PX;
export const FRAME_H = GH * PX;

export type Facing = 'down' | 'up' | 'left' | 'right';
type Hair = 'short' | 'long' | 'cap' | 'bald';
type Build = 'normal' | 'slim' | 'big';

export interface Look {
  key: string;
  /** Nome do personagem pintado (npm run art), se houver: `body-<paint>-front/back`. */
  paint?: string;
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
  if (fixed) return { key: `chr-${id}`, paint: PAINTED.includes(id) ? id : undefined, ...fixed };
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    key: `chr-${id}`,
    paint: PAINTED.includes(id) ? id : undefined,
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

export const zombieLook = (kind: ZombieKind): Look => ({ key: `zmb-${kind}`, paint: `zombie-${kind}`, ...ZOMBIE_LOOKS[kind] });

/** Quem tem versão pintada. Os demais (e qualquer um, se a imagem não carregar) usam o desenho por código. */
const PAINTED = ['marta', 'iuri', 'lena', 'bruno', 'ana', 'caio', 'dona_rita', 'teo'];
const PAINTED_ALL = [...PAINTED, 'zombie-walker', 'zombie-runner', 'zombie-brute'];

/** Carrega os personagens pintados. Chame no preload() de cada cena que tem gente. */
export function preloadBodies(scene: Phaser.Scene): void {
  for (const id of PAINTED_ALL) {
    for (const v of ['front', 'back']) {
      const key = `body-${id}-${v}`;
      if (!scene.textures.exists(key)) scene.load.image(key, artUrl(key));
    }
  }
}

/** Altura do personagem pintado na tela, em pixels lógicos. */
const BODY_H = { normal: 46, slim: 45, big: 51 } as const;

type View = 'down' | 'up' | 'side';
type Paint = number | CanvasGradient;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Pinta um quadro do personagem. As medidas são em unidades da grade (16×20). */
function paintFigure(ctx: CanvasRenderingContext2D, L: Look, view: View, step: 0 | 1 | 2, asleep = false): void {
  const shirtD = shade(L.shirt, 0.66);
  const skinD = shade(L.skin, 0.76);
  const pantsD = shade(L.pants, 0.66);
  const shoe = L.zombie ? shade(L.pants, 0.55) : 0x1c1814;
  const eye = L.zombie ? 0xe0573a : 0x1a1712;
  const grow = L.build === 'big' ? 1 : L.build === 'slim' ? -1 : 0;

  const fill = (c: Paint) => (ctx.fillStyle = typeof c === 'number' ? hex(c) : c);
  /** Do tom claro (esquerda) ao escuro (direita): a luz vem sempre do mesmo lado. */
  const grad = (x0: number, x1: number, light: number, dark: number): CanvasGradient => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0.25, hex(light));
    g.addColorStop(1, hex(dark));
    return g;
  };
  const ell = (cx: number, cy: number, rx: number, ry: number, c: Paint, rot = 0) => {
    fill(c);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const rr = (x: number, y: number, w: number, h: number, r: number, c: Paint) => {
    fill(c);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  /** Braço ou perna: um traço grosso de pontas redondas. */
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number, c: number) => {
    ctx.strokeStyle = hex(c);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const head = (back: boolean, side: boolean) => {
    const cx = 6;
    const cy = 3.7;
    const rx = 3.5;
    const ry = 3.3;
    rr(cx - 1, 6.1, 2, 1.5, 0.5, skinD);
    // Cabelo comprido cai atrás da cabeça.
    if (L.hairStyle === 'long') {
      if (side) rr(cx - 3.9, 2.4, 3.6, 6, 1.6, shade(L.hair, 0.8));
      else rr(cx - 3.9, 2.4, 7.8, back ? 6.4 : 5.8, 2.2, shade(L.hair, 0.8));
    }
    ell(cx, cy, rx, ry, grad(cx - rx, cx + rx, L.skin, skinD));
    if (side) {
      ell(cx + rx - 0.05, cy + 0.8, 0.6, 0.5, skinD);
    } else {
      ell(cx - rx + 0.1, cy + 0.4, 0.5, 0.8, skinD);
      ell(cx + rx - 0.1, cy + 0.4, 0.5, 0.8, skinD);
    }
    if (!back) {
      if (side) {
        if (asleep) limb(cx + 1.4, cy + 0.4, cx + 2.3, cy + 0.4, 0.3, skinD);
        else ell(cx + 1.9, cy + 0.3, 0.42, 0.52, eye);
      } else if (asleep) {
        limb(cx - 2, cy + 0.5, cx - 1, cy + 0.5, 0.3, shade(L.skin, 0.55));
        limb(cx + 1, cy + 0.5, cx + 2, cy + 0.5, 0.3, shade(L.skin, 0.55));
      } else {
        ell(cx - 1.5, cy + 0.4, 0.42, 0.54, eye);
        ell(cx + 1.5, cy + 0.4, 0.42, 0.54, eye);
      }
      if (L.zombie) rr(side ? cx + 0.9 : cx - 1, cy + 1.7, 2, 0.75, 0.3, 0x3a1512);
      else if (!side) limb(cx - 0.6, cy + 2, cx + 0.6, cy + 2, 0.24, shade(L.skin, 0.58));
    }
    // Cabelo ou boné: recortado no formato da cabeça.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 0.3, ry + 0.3, 0, 0, Math.PI * 2);
    ctx.clip();
    if (L.hairStyle === 'cap') {
      fill(L.shirt);
      ctx.fillRect(cx - 5, -1, 10, back ? cy + 0.6 : cy - 0.2);
    } else if (L.hairStyle !== 'bald') {
      fill(L.hair);
      if (back) ctx.fillRect(cx - 5, -1, 10, 9);
      else if (side) ell(cx - 1.3, cy - 1.3, rx + 0.4, ry, L.hair);
      else ell(cx, cy - 2.4, rx + 0.7, 2.5, L.hair);
      ctx.globalAlpha = 0.45;
      ell(cx - 1.2, cy - 2.5, 1.4, 0.5, shade(L.hair, 1.35), -0.3);
      ctx.globalAlpha = 1;
    } else if (L.zombie) {
      ell(cx - 1, cy - 2, 1.2, 0.6, skinD);
    }
    ctx.restore();
    // Aba do boné, para fora da cabeça.
    if (L.hairStyle === 'cap' && !back) {
      if (side) rr(cx + 0.6, cy - 0.9, 4, 0.85, 0.4, shirtD);
      else rr(cx - 3.3, cy - 0.9, 6.6, 0.9, 0.4, shirtD);
    }
  };

  if (view === 'side') {
    // Pernas: paradas juntas; andando, abertas em tesoura (a de trás mais escura).
    if (step === 0) {
      limb(6, 13, 6, 16.3, 2.5, L.pants);
      ell(6.5, 17.1, 1.6, 0.8, shoe);
    } else {
      const k = step === 1 ? 1 : -1;
      limb(6, 13, 6 - 1.8 * k, 16.2, 2.2, pantsD);
      ell(6 - 1.8 * k + 0.5, 17, 1.4, 0.75, shoe);
      limb(6, 13, 6 + 1.8 * k, 16.2, 2.2, L.pants);
      ell(6 + 1.8 * k + 0.5, 17, 1.4, 0.75, shoe);
    }
    const sw = 5.2 + grow * 1.2;
    const sx = 6 - sw / 2;
    rr(sx, 7, sw, 6.3, 1.8, grad(sx, sx + sw, L.shirt, shirtD));
    if (L.zombie) {
      // Braços esticados para a frente.
      limb(6.4, 8.7, 10.4, 8.9 + (step === 1 ? 0.6 : 0), 1.5, L.skin);
      ell(5, 10.2, 1.1, 0.6, 0x7a1f1a);
    } else {
      const s = step === 1 ? 1.4 : step === 2 ? -1.4 : 0;
      limb(6, 8.2, 6 + s, 11.1, 1.6, shirtD);
      ell(6 + s, 11.8, 0.75, 0.75, L.skin);
    }
    head(false, true);
    return;
  }

  const back = view === 'up';
  const liftL = step === 1 ? 1 : 0;
  const liftR = step === 2 ? 1 : 0;
  limb(4.4, 13, 4.4, 16.3 - liftL, 2.2, liftL ? pantsD : L.pants);
  ell(4.4, 17.1 - liftL, 1.25, 0.8, shoe);
  limb(7.6, 13, 7.6, 16.3 - liftR, 2.2, liftR ? pantsD : L.pants);
  ell(7.6, 17.1 - liftR, 1.25, 0.8, shoe);
  rr(3.2, 11.8, 5.6, 2.4, 0.9, grad(3.2, 8.8, L.pants, pantsD));

  const tx = 2.4 - grow * 0.8;
  const tw = 7.2 + grow * 1.6;
  const swing = step === 1 ? -1 : step === 2 ? 1 : 0;
  if (L.zombie) {
    // Braços caídos e descobertos.
    limb(tx + 0.3, 8, tx - 0.7, 10.6 + liftL, 1.5, L.skin);
    limb(tx + tw - 0.3, 8, tx + tw + 0.7, 10.6 + liftR, 1.5, skinD);
  } else {
    limb(tx + 0.3, 8, tx - 0.3, 10.9 + swing, 1.5, L.shirt);
    ell(tx - 0.3, 11.6 + swing, 0.75, 0.75, L.skin);
    limb(tx + tw - 0.3, 8, tx + tw + 0.3, 10.9 - swing, 1.5, shirtD);
    ell(tx + tw + 0.3, 11.6 - swing, 0.75, 0.75, skinD);
  }
  rr(tx, 7, tw, 6.3, 1.7, grad(tx, tx + tw, L.shirt, shirtD));
  if (!back) {
    // Gola.
    fill(skinD);
    ctx.beginPath();
    ctx.moveTo(5.1, 7);
    ctx.lineTo(6.9, 7);
    ctx.lineTo(6, 8.2);
    ctx.fill();
    if (L.zombie) {
      ell(tx + 2.6, 9.6, 1.2, 0.7, 0x7a1f1a, 0.4);
      ell(tx + 3.8, 10.7, 0.8, 0.5, 0x7a1f1a);
    }
  }
  head(back, false);
}

/** Quadro pronto: a figura com um contorno escuro em volta, que a destaca do chão. */
function frameCanvas(L: Look, view: View, step: 0 | 1 | 2, asleep = false): HTMLCanvasElement {
  const w = FRAME_W * SS;
  const h = FRAME_H * SS;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const fig = make();
  const fctx = fig.getContext('2d')!;
  fctx.scale(U, U);
  fctx.translate(OX, OY);
  paintFigure(fctx, L, view, step, asleep);
  // Silhueta escura da mesma figura, carimbada em volta.
  const sil = make();
  const sctx = sil.getContext('2d')!;
  sctx.drawImage(fig, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = OUTLINE;
  sctx.fillRect(0, 0, w, h);
  const out = make();
  const octx = out.getContext('2d')!;
  const d = U * 0.42;
  for (let k = 0; k < 12; k++) octx.drawImage(sil, Math.cos((k * Math.PI) / 6) * d, Math.sin((k * Math.PI) / 6) * d);
  octx.drawImage(fig, 0, 0);
  return out;
}

const VIEWS: View[] = ['down', 'up', 'side'];

/** Cria (uma vez por visual) a textura e as animações de andar. */
export function ensureLook(scene: Phaser.Scene, L: Look): string {
  if (scene.textures.exists(L.key)) return L.key;
  const fw = FRAME_W * SS;
  const fh = FRAME_H * SS;
  const tex = scene.textures.createCanvas(L.key, fw * 3, fh * 4)!;
  const ctx = tex.getContext();
  const blit = (frame: HTMLCanvasElement, col: number, row: number, name: string) => {
    ctx.drawImage(frame, col * fw, row * fh);
    tex.add(name, 0, col * fw, row * fh, fw, fh);
  };
  VIEWS.forEach((v, row) => {
    for (const step of [0, 1, 2] as const) blit(frameCanvas(L, v, step), step, row, `${v}${step}`);
    scene.anims.create({
      key: `${L.key}-${v}`,
      frames: [1, 0, 2, 0].map((n) => ({ key: L.key, frame: `${v}${n}` })),
      frameRate: L.zombie ? 6 : 9,
      repeat: -1,
    });
  });
  blit(frameCanvas(L, 'down', 0, true), 0, 3, 'sleep');
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
  /** Personagem pintado: duas imagens (frente e costas) animadas por balanço, sem quadros. */
  private painted: { front: string; back: string; scale: number } | null = null;
  private bob: Phaser.Tweens.Tween | null = null;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, look: Look) {
    this.scene = scene;
    this.key = ensureLook(scene, look);
    this.shadow = scene.add.ellipse(0, 0, look.build === 'big' ? 22 : 18, 6, 0x000000, 0.35);
    const front = `body-${look.paint}-front`;
    const back = `body-${look.paint}-back`;
    if (look.paint && scene.textures.exists(front) && scene.textures.exists(back)) {
      const h = scene.textures.get(front).getSourceImage().height;
      this.painted = { front, back, scale: BODY_H[look.build] / h };
      this.sprite = scene.add.sprite(0, 1, front).setOrigin(0.5, 1).setScale(this.painted.scale);
      // Contorno escuro fino: destaca o personagem do chão pintado, como o contorno dos bonecos antigos.
      this.sprite.preFX?.addGlow(0x0b0a08, 3, 0, false, 0.1, 6);
    } else {
      this.sprite = scene.add.sprite(0, PX, this.key, 'down0').setOrigin(0.5, 1).setScale(1 / SS);
    }
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
    this.stopBob();
    this.sprite.setCrop().setAngle(0).setPosition(0, this.painted ? 1 : PX);
    this.shadow.setVisible(pose === 'stand');
    if (this.painted) {
      const src = this.scene.textures.get(this.painted.front).getSourceImage();
      // Na cama só a cabeça e os ombros ficam fora do cobertor.
      if (pose === 'bed') this.sprite.setTexture(this.painted.front).setCrop(0, 0, src.width, src.height * 0.3);
      if (pose === 'floor') this.sprite.setTexture(this.painted.front).setAngle(-90).setPosition(BODY_H.normal / 2 - 4, 0);
    } else {
      if (pose === 'bed') this.sprite.setCrop(0, 0, FRAME_W * SS, 20 * SS);
      if (pose === 'floor') this.sprite.setAngle(-90).setPosition(FRAME_H / 2 - 4, 0);
    }
    this.refresh();
  }

  private stopBob(): void {
    this.bob?.stop();
    this.bob = null;
  }

  private refresh(): void {
    if (this.painted) {
      if (this.pose !== 'stand') {
        this.sprite.setFlipX(false);
        return;
      }
      this.sprite.setTexture(this.view === 'up' ? this.painted.back : this.painted.front);
      if (this.walking && !this.bob) {
        // Passo: sobe e desce e balança de leve, no ritmo de quem anda cansado.
        this.bob = this.scene.tweens.add({ targets: this.sprite, y: -0.6, angle: { from: -2.2, to: 2.2 }, duration: 210, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (!this.walking && this.bob) {
        this.stopBob();
        this.sprite.setPosition(0, 1).setAngle(0);
      }
      return;
    }
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

import Phaser from 'phaser';
import { RECRUITS, SURVIVORS } from '../data/survivors';
import { ZOMBIES, type ZombieKind } from '../data/zombies';
import { Actor, survivorLook, zombieLook, type Facing, type Look } from './sprites';

const FACINGS: Facing[] = ['down', 'right', 'up', 'left'];

/** Galeria de personagens (abra com `?sprites`): todos os visuais, parados e andando, ampliados. */
export class GalleryScene extends Phaser.Scene {
  constructor() {
    super('gallery');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2a2823');
    const cast: { name: string; look: Look }[] = [
      ...[...SURVIVORS, ...RECRUITS].map((d) => ({ name: d.name, look: survivorLook(d.id) })),
      ...(Object.keys(ZOMBIES) as ZombieKind[]).map((k) => ({ name: ZOMBIES[k].name, look: zombieLook(k) })),
    ];
    const cols = 6;
    const cellW = 128;
    const cellH = 270;
    cast.forEach((c, i) => {
      const x = 16 + (i % cols) * cellW;
      const y = 14 + Math.floor(i / cols) * cellH;
      this.add.rectangle(x, y, cellW - 10, cellH - 12, i % 2 ? 0x3a372f : 0x36332b).setOrigin(0);
      this.add.text(x + (cellW - 10) / 2, y + 6, c.name, { fontFamily: 'monospace', fontSize: '13px', color: '#f1ebe0' }).setOrigin(0.5, 0);
      // Em cima: grande, andando de lado. Embaixo: as quatro direções, a primeira parada.
      const big = new Actor(this, c.look);
      big.container.setPosition(x + (cellW - 10) / 2, y + 150).setScale(3);
      big.face('right');
      big.setWalking(true);
      FACINGS.forEach((f, k) => {
        const a = new Actor(this, c.look);
        a.container.setPosition(x + 18 + k * 28, y + 240);
        a.face(f);
        a.setWalking(k > 0);
      });
    });
  }
}

import Phaser from 'phaser';

/**
 * Visão 3/4 (oblíqua), no espírito dos jogos da Kairosoft: o grid continua quadrado,
 * mas tudo que tem altura mostra o topo e a frente. Paredes e móveis "sobem" WALL_H
 * pixels, então a cena é desenhada linha por linha (de cima para baixo) e cada objeto
 * ganha profundidade pela linha onde seus pés estão.
 */
export const TILE = 28;
export const WALL_H = 14;

/** Profundidade de uma linha do grid; objetos da mesma linha usam frações dela. */
export const rowDepth = (row: number, layer = 0): number => 10 + row * 10 + layer;

export function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const adj = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return Phaser.Display.Color.GetColor(adj(c.red), adj(c.green), adj(c.blue));
}

/** Câmera deslocada para caber o topo das paredes da primeira linha. */
export function setupObliqueCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setScroll(0, -WALL_H);
}

/**
 * Bloco com altura sobre um retângulo do chão (em pixels): topo deslocado para cima
 * e, se `front`, a face da frente.
 */
export function box(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  top: number,
  front = true,
  frontColor = shade(top, 0.62),
): void {
  if (front) g.fillStyle(frontColor).fillRect(x, y + d - h, w, h);
  g.fillStyle(top).fillRect(x, y - h, w, d);
  g.lineStyle(1, 0x000000, 0.25).strokeRect(x + 0.5, y - h + 0.5, w - 1, d + (front ? h : 0) - 1);
}

/** Uma parede de 1 tile; só mostra a frente se o tile de baixo não for parede. */
export function wall(g: Phaser.GameObjects.Graphics, tx: number, ty: number, frontVisible: boolean, top = 0x6d665b, front = 0x4a453d): void {
  const px = tx * TILE;
  const py = ty * TILE;
  if (frontVisible) {
    g.fillStyle(front).fillRect(px, py + TILE - WALL_H, TILE, WALL_H);
    // Rodapé e juntas dos tijolos, para a frente não ficar lisa.
    g.fillStyle(shade(front, 0.75)).fillRect(px, py + TILE - 3, TILE, 3);
    g.lineStyle(1, shade(front, 0.8), 0.7).lineBetween(px, py + TILE - WALL_H / 2, px + TILE, py + TILE - WALL_H / 2);
    g.lineBetween(px + (ty % 2 ? 9 : 19), py + TILE - WALL_H, px + (ty % 2 ? 9 : 19), py + TILE - WALL_H / 2);
  }
  g.fillStyle(top).fillRect(px, py - WALL_H, TILE, TILE);
  g.fillStyle(shade(top, 1.12)).fillRect(px, py - WALL_H, TILE, 3);
}

/** Pés de quem está no tile (tx, ty). */
export function feet(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 6 };
}

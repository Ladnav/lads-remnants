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

export interface FigureStyle {
  body: number;
  skin: number;
  hair?: number;
  zombie?: boolean;
}

/**
 * Pessoa (ou zumbi) em pé, desenhada a partir dos pés. Devolve um container
 * posicionado em (0,0) = ponto dos pés; quem chama move e ajusta a profundidade.
 */
export function figure(scene: Phaser.Scene, style: FigureStyle): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillEllipse(0, 0, 18, 6);
  // pernas
  g.fillStyle(style.zombie ? 0x3a3a30 : 0x2e2b3a).fillRect(-5, -9, 4, 9).fillRect(1, -9, 4, 9);
  // tronco
  g.fillStyle(style.body).fillRoundedRect(-7, -21, 14, 13, 3);
  g.fillStyle(shade(style.body, 0.75)).fillRect(-7, -11, 14, 3);
  // braços
  if (style.zombie) {
    g.fillStyle(style.skin).fillRect(-11, -19, 6, 3).fillRect(5, -18, 7, 3);
  } else {
    g.fillStyle(shade(style.body, 0.85)).fillRect(-9, -20, 3, 9).fillRect(6, -20, 3, 9);
  }
  // cabeça
  g.fillStyle(style.skin).fillCircle(0, -26, 6);
  if (style.hair !== undefined) g.fillStyle(style.hair).fillRect(-6, -32, 12, 4);
  g.fillStyle(style.zombie ? 0xe0573a : 0x1a1712).fillRect(-3, -27, 2, 2).fillRect(1, -27, 2, 2);
  return scene.add.container(0, 0, [g]);
}

/** Pés de quem está no tile (tx, ty). */
export function feet(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 6 };
}

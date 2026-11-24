import Phaser from 'phaser';

/**
 * Visão 3/4 (oblíqua), no espírito dos jogos da Kairosoft: o grid continua quadrado,
 * mas tudo que tem altura mostra o topo e a frente. Paredes e móveis "sobem" WALL_H
 * pixels, então a cena é desenhada linha por linha (de cima para baixo) e cada objeto
 * ganha profundidade pela linha onde seus pés estão.
 */
export const TILE = 28;
export const WALL_H = 14;
/**
 * Nitidez de pixel art: o canvas tem os pixels FÍSICOS da área do jogo (main.ts) e a câmera amplia
 * sempre por um número inteiro. Assim cada pixel do jogo vira um quadrado inteiro na tela, sem o
 * navegador reamostrar nada. Ampliação de uma cena de w×h num canvas cw×ch, com reforço em tela estreita.
 */
export function cameraZoom(scene: Phaser.Scene, w: number, h: number, boost = 1): number {
  const fit = Math.min(scene.scale.width / w, scene.scale.height / (h + WALL_H));
  return Math.max(1, Math.round(fit * boost));
}

/** Tela estreita (celular): a cena inteira não cabe legível, então aproxima e anda com o dedo. */
const narrow = (): boolean => window.matchMedia('(max-width: 900px)').matches;

/** Profundidade de uma linha do grid; objetos da mesma linha usam frações dela. */
export const rowDepth = (row: number, layer = 0): number => 10 + row * 10 + layer;

export function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const adj = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return Phaser.Display.Color.GetColor(adj(c.red), adj(c.green), adj(c.blue));
}

/** Quanto a câmera aproxima em tela estreita. */
const NARROW_ZOOM = 1.8;
/** Arrasto menor que isto (em pixels do canvas, que são físicos) ainda conta como toque. */
export const TAP_SLOP = 10 * (window.devicePixelRatio || 1);

/**
 * Enquadra uma cena w×h com ampliação inteira. Se couber, fica centrada; se não couber (celular, ou
 * tela de densidade alta), começa em `focus` e anda com o dedo. Refaz sozinha quando o canvas muda.
 */
export function setupObliqueCamera(scene: Phaser.Scene, w = 0, h = 0, focus?: { x: number; y: number }): void {
  sharpText(scene);
  const cam = scene.cameras.main;
  const fit = (): void => {
    const W = w || scene.scale.width;
    const H = h || scene.scale.height - WALL_H;
    const z = cameraZoom(scene, W, H, narrow() ? NARROW_ZOOM : 1);
    cam.setOrigin(0.5, 0.5).setZoom(z);
    const fits = W * z <= scene.scale.width + 1 && (H + WALL_H) * z <= scene.scale.height + 1;
    if (fits) cam.removeBounds().centerOn(W / 2, (H - WALL_H) / 2);
    else cam.setBounds(0, -WALL_H, W, H + WALL_H).centerOn(focus?.x ?? W / 2, focus?.y ?? H / 2);
    (scene as Phaser.Scene & { panning?: boolean }).panning = !fits;
  };
  fit();
  scene.scale.on('resize', fit);
  scene.events.once('shutdown', () => scene.scale.off('resize', fit));
  // Arrastar move a câmera quando a cena não cabe inteira.
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!p.isDown || !(scene as Phaser.Scene & { panning?: boolean }).panning) return;
    cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
    cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
  });
}

/** Mantido por compatibilidade: o enquadramento agora é todo em setupObliqueCamera. */
export function enablePan(scene: Phaser.Scene, w: number, h: number, focus: { x: number; y: number }): boolean {
  setupObliqueCamera(scene, w, h, focus);
  return !!(scene as Phaser.Scene & { panning?: boolean }).panning;
}

/**
 * As pinturas que ainda restam (abrigo, mapa, personagens pintados) ficam com filtro suave até serem
 * trocadas por pixel art; com o filtro de pixel elas serrilham ao serem reduzidas.
 */
export function smoothPainted(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    if (/^(body-|prop-|shelter-bg|region-map|soft-shadow|shelter-light|mote)/.test(key)) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }
}

/** Todo texto criado na cena nasce na resolução do canvas, senão fica borrado com o zoom. */
export function sharpText(scene: Phaser.Scene): void {
  const add = scene.add as Phaser.GameObjects.GameObjectFactory & { sharp?: boolean };
  if (add.sharp) return;
  add.sharp = true;
  const make = add.text.bind(add);
  add.text = (...args: Parameters<typeof make>) => make(...args).setResolution(4);
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

/** Arte gerada (`npm run art`): pinturas antigas em public/art, interface em pixel em public/pixel/ui. */
const BASE = import.meta.env.BASE_URL;
const FACES = new Set(['marta', 'iuri', 'lena', 'bruno', 'ana', 'caio', 'dona_rita', 'teo']);
const PLACES = new Set(['market', 'garage', 'pharmacy', 'hospital', 'police']);

export const artUrl = (name: string): string => `${BASE}art/${name}.webp`;
/** Arte da interface em pixel (npm run pixel:ui → public/pixel/ui). */
const uiUrl = (name: string): string => `${BASE}pixel/ui/${name}.png`;
/** Retrato em pixel do sobrevivente (64×64), se houver. */
export const faceUrl = (id: string): string | null => (FACES.has(id) ? uiUrl(`face-${id}`) : null);
/** Retrato da ficha do personagem: o mesmo, ampliado pelo CSS sem borrar. */
export const faceLargeUrl = faceUrl;
/** Cena do local, se houver. */
export const placeUrl = (id: string): string | null => (PLACES.has(id) ? uiUrl(`scene-${id}`) : null);
/** Faixa ilustrada (cena em pixel) no topo de um cartão ou de uma tela. */
export const banner = (name: string, cls = ''): string => `<div class="banner ${cls}" style="background-image:url('${uiUrl(`scene-${name}`)}')"></div>`;

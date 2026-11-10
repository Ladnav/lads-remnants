/** Arte pintada (gerada por `npm run art`, servida de public/art). */
const BASE = import.meta.env.BASE_URL;
const FACES = new Set(['marta', 'iuri', 'lena', 'bruno', 'ana', 'caio', 'dona_rita', 'teo']);
const PLACES = new Set(['market', 'garage', 'pharmacy', 'hospital', 'police']);

export const artUrl = (name: string): string => `${BASE}art/${name}.webp`;
/** Retrato pintado do sobrevivente, se houver. */
export const faceUrl = (id: string): string | null => (FACES.has(id) ? artUrl(id) : null);
/** Retrato grande, para a ficha do personagem. */
export const faceLargeUrl = (id: string): string | null => (FACES.has(id) ? artUrl(`${id}-lg`) : null);
/** Ilustração do local, se houver. */
export const placeUrl = (id: string): string | null => (PLACES.has(id) ? artUrl(id) : null);
/** Faixa ilustrada no topo de um cartão ou de uma tela. */
export const banner = (name: string, cls = ''): string => `<div class="banner ${cls}" style="background-image:url('${artUrl(name)}')"></div>`;

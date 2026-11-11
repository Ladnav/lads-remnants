// Gera a arte do jogo pela API do Gemini.
//   npm run art                 gera o que ainda não existe e monta as versões leves
//   npm run art -- marta teo    só os trabalhos citados
//   npm run art -- --force x    refaz mesmo que o arquivo exista
//   npm run art -- --cost       só mostra quanto já foi gasto
// Originais em art/raw/, versões leves (webp) em public/art/.
// Cada chamada paga entra em art/ledger.json; ART_BUDGET_USD (no .env.local) é o teto de gasto.
// A chave fica em .env.local (GEMINI_API_KEY) e nunca vai para o git.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import sharp from 'sharp';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.GEMINI_API_KEY;
const MODEL = env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
const BUDGET = Number(env.ART_BUDGET_USD || 6);
/** Saldo de créditos que a conta tinha antes deste projeto (informado à mão; a API não devolve saldo). */
const CREDITS = Number(env.GEMINI_CREDITS_USD || 0);

/** US$ por milhão de tokens, do nível pago (aistudio.google.com/docs/pricing, nov/2026). */
const PRICES = {
  'gemini-3-pro-image': { input: 2, text: 12, image: 120 },
  'gemini-3.1-flash-image': { input: 0.5, text: 3, image: 60 },
  'gemini-3.1-flash-lite-image': { input: 0.25, text: 1.5, image: 30 },
  'gemini-2.5-flash-image': { input: 0.3, text: 2.5, image: 30 },
};

const LEDGER = 'art/ledger.json';
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { note: 'Custo estimado pelos tokens que a API devolve; o saldo real está no painel do Google.', entries: [] };
const spent = () => ledger.entries.reduce((a, e) => a + e.usd, 0);

function charge(job, usage) {
  const p = PRICES[MODEL] ?? PRICES['gemini-3-pro-image'];
  const out = usage?.candidatesTokensDetails ?? [];
  const imageTokens = out.filter((d) => d.modality === 'IMAGE').reduce((a, d) => a + d.tokenCount, 0) || (usage?.candidatesTokenCount ?? 1120);
  const textTokens = (usage?.candidatesTokenCount ?? imageTokens) - imageTokens + (usage?.thoughtsTokenCount ?? 0);
  const inputTokens = usage?.promptTokenCount ?? 0;
  const usd = (inputTokens * p.input + Math.max(0, textTokens) * p.text + imageTokens * p.image) / 1e6;
  ledger.entries.push({ at: new Date().toISOString(), job, model: MODEL, inputTokens, textTokens: Math.max(0, textTokens), imageTokens, usd: Math.round(usd * 1e4) / 1e4 });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  return usd;
}

/** O mesmo parágrafo de estilo entra em todo pedido: é o que mantém as imagens parecidas. */
const STYLE = `Art style: gritty realistic digital painting with visible dry-brush and charcoal texture, like concept art for a grim survival drama. Muted, desaturated palette of cold greys, olive and rust, with small pools of warm light from candles, lanterns or fire. Low-key lighting, deep soft shadows, dust in the air. Setting: a Brazilian city months after a collapse, overgrown and abandoned. No text, no letters, no logos, no watermark, no UI, no frame.`;

const face = (id, who) => ({
  id,
  aspect: '1:1',
  width: 192,
  large: 640,
  prompt: `Head-and-shoulders portrait of ${who}. Three-quarter face, looking slightly away from the viewer, tired and wary expression, dirt and sweat on the skin, worn everyday clothes. Plain dark blurred interior background lit by a single warm lantern from the left. Square composition, face centered. ${STYLE}`,
});
const place = (id, what) => ({
  id,
  aspect: '16:9',
  width: 800,
  prompt: `${what} Seen from across the street at dusk. Empty street, no people, weeds through the pavement. ${STYLE}`,
});
/** Refaz uma pintura já aprovada em 4K. O arquivo leve sai com o nome da original (`as`). */
const hd = (id, as, ref) => ({
  id,
  as,
  aspect: '4:3',
  size: '4K',
  // 3840 cabe no limite de textura dos celulares e segura a câmera aproximada.
  width: 3840,
  refs: [ref],
  prompt: 'Upscale the attached painting to a much higher resolution. It must stay the SAME image: identical composition, framing, geometry, colours, lighting and content, with every wall, building, street and object in exactly the same position and size. Do not add, remove, move or restyle anything, and do not crop or pad. Only add resolution: crisper edges, finer brush texture and small surface detail (cracks, grain, stains, leaves, roof tiles) consistent with what is already there.',
});
const scene = (id, what) => ({ id, aspect: '16:9', width: 960, prompt: `${what} ${STYLE}` });

/** Textura de superfície, vista reta de cima, sem luz marcada: o jogo repete e ilumina. */
const TEX = `Hand-painted game texture, gritty realistic digital painting with dry-brush and charcoal grain, muted desaturated palette. The surface fills the entire image edge to edge, perfectly flat and evenly lit from all sides, no perspective, no vignette, no cast shadows, no objects, no text, no border.`;
const texture = (id, what) => ({ id, aspect: '1:1', width: 768, shelved: true, prompt: `${what} ${TEX}` });

/** Objeto isolado sobre magenta puro, para recortar. Mesmo ângulo de câmera do jogo. */
const PROP = `Single isolated game prop, gritty realistic digital painting with dry-brush and charcoal grain, muted desaturated palette, worn, dirty, improvised from scavenged materials. Orthographic three-quarter top-down view: the camera looks down at about 55 degrees, so both the top surface and the front side of the object are visible, front side facing the bottom of the image, no perspective distortion. The whole object is visible and centered with a margin around it. Soft even overcast lighting from above. Background: one flat uniform pure magenta colour (#FF00FF) filling everything, no floor, no ground shadow, no gradient, no text.`;
const prop = (id, width, what) => ({ id, aspect: '1:1', width, key: true, shelved: true, prompt: `${what} ${PROP}` });

const JOBS = [
  {
    // Pintura do abrigo sobre a planta exata do jogo (node scripts/art-ref-shelter.mjs).
    id: 'shelter',
    aspect: '4:3',
    width: 1568,
    refs: ['art/ref/shelter-plan.png'],
    prompt: `The attached image is the exact floor plan of a game level: a house seen from above with its roof removed. Repaint it as a finished, beautiful hand-painted game background, as a pixel-accurate paint-over: every wall, every door gap and every room must stay in exactly the same position, size and proportion as in the plan, and the image must keep the same framing, with the outer walls touching the image edges. Do not rotate, crop, zoom, add perspective, show the outside of the building or add a border. Camera: top-down with a slight oblique tilt, exactly as drawn. The light beige shapes are the flat tops of thick masonry walls: paint them as worn cement and plaster with a few chipped spots, clearly lighter than the floors. The darker strip under each wall is its front face: paint it as dirty cracked plaster with a little exposed brick, with a soft shadow falling on the floor below it. Floors by colour in the plan: brown areas are old wooden floorboards, worn and stained; pale grey areas are cracked dirty ceramic tiles; mid grey areas are stained bare concrete; the green area on the right is a backyard of trampled earth, dry grass and weeds. The small brown rectangle at the bottom is the wooden front door. Rooms are EMPTY: no furniture, no objects, no people, no rugs, no candles, no lamps, no fire, no text, no symbols. Only floor wear: stains, scratches, dust, a few leaves and small debris. Flat, even, overcast daylight from above with no light pools, so the game can add its own lighting. ${STYLE}`,
  },
  // Sobreviventes
  face('marta', 'Marta, a Brazilian woman around 40, a former electrician: lean, brown skin, dark hair tied back, deep-set sleepless eyes, mustard-yellow work shirt'),
  face('iuri', 'Iuri, a Brazilian man around 35, a former mall security guard: big and broad-shouldered, short black hair, stubble, stubborn jaw, faded blue shirt'),
  face('lena', 'Lena, a Brazilian woman around 22, a nursing student: slight build, light brown skin, auburn hair in a messy short cut, alert quiet eyes, green hooded jacket'),
  face('bruno', 'Bruno, a Brazilian man around 50, a former city bus driver: heavyset, Black, greying short beard, kind tired eyes with a half smile that does not reach them, worn grey polo shirt'),
  face('ana', 'Ana, a Brazilian woman around 45, a former schoolteacher: thin, pale olive skin, shoulder-length brown hair with grey strands, cracked glasses, anxious eyes, faded cardigan'),
  face('caio', 'Caio, a Brazilian teenage boy of 15 trying to look older: skinny, brown skin, curly black hair, oversized dark hoodie, defiant but scared look'),
  face('dona_rita', 'Dona Rita, a Brazilian woman around 70, a retired seamstress: small and wiry, wrinkled brown skin, white hair in a tight bun, sharp disapproving eyes, floral blouse under an old knitted vest'),
  face('teo', 'Téo, a Brazilian man around 28, a former jiu-jitsu fighter: athletic, light brown skin, shaved head, cauliflower ear, dark circles under frightened eyes, stained white tank top'),
  // Locais
  place('market', 'Exterior of a small abandoned neighbourhood supermarket in a Brazilian city. Rolled-up steel shutter half open, broken glass, overturned shopping carts, a faded blank sign above the door, a dead car at the kerb, one faint light inside.'),
  place('garage', 'Exterior of a small abandoned car repair garage in a Brazilian suburb. Open roller door, a car on jack stands inside, stacked tyres, oil drums, tools scattered, a rusted blank sign, an engine hoist in the shadows.'),
  place('pharmacy', 'Exterior of a looted corner pharmacy in a Brazilian city. Smashed glass door, empty shelves visible inside, pill boxes scattered on the pavement, a broken unlit cross-shaped sign, security grille torn open.'),
  place('hospital', 'Entrance of an abandoned municipal public hospital in a Brazilian city. Wide concrete facade, an ambulance with open doors, stretchers and wheelchairs left outside, dark broken windows, barricade of benches at the doors.'),
  place('police', 'Exterior of an abandoned police station in a Brazilian city. Low concrete building with barred windows, a burnt-out patrol car, sandbags and a toppled barrier, the steel door ajar on darkness.'),
  // Superfícies do cenário
  texture('tex-wood', 'Top-down view of an old wooden plank floor: long horizontal boards of uneven width, dark worn brown, scratches, stains, gaps between boards, a few nail heads.'),
  texture('tex-tile', 'Top-down view of an old bathroom floor of small square off-white ceramic tiles with dark grout, several cracked or chipped, grime and rust stains.'),
  texture('tex-concrete', 'Top-down view of a bare stained concrete floor with hairline cracks, damp patches, dust and faint tyre and boot marks.'),
  texture('tex-yard', 'Top-down view of a neglected backyard ground: trampled dark earth with patches of dry grass and low weeds, small stones, dead leaves.'),
  texture('tex-walltop', 'Top-down view of the broken top of a thick masonry wall: rough grey cement and crumbling plaster with exposed edges of red brick, dust and small rubble.'),
  texture('tex-wallface', 'Straight front view of an old interior house wall: dirty cracked off-white plaster with large patches fallen away showing horizontal courses of red brick, damp stains running down, darker grime near the bottom.'),
  // Móveis e construções
  prop('prop-bed', 480, 'A narrow single bed: a low frame of rough planks with a thin stained mattress, a grey wool blanket and a flat pillow at the top end. The bed is placed vertically, head at the top of the image.'),
  prop('prop-workbench', 540, 'A heavy improvised workbench made of an old door on trestles, with a vise, hand tools, a saw, wire coils and a small toolbox on top.'),
  prop('prop-stove', 480, 'A small improvised wood-burning cooking stove made from a cut steel drum with a blackened pot on top, embers glowing in the opening, a short chimney pipe.'),
  prop('prop-filter', 450, 'An improvised water filter: a blue plastic barrel standing on cinder blocks with a tap, a funnel with layered cloth, sand and charcoal on top, and a bucket under the tap.'),
  prop('prop-latrine', 450, 'An improvised dry toilet: a wooden box seat with a hole over a bucket, a roll of paper and a small bucket of sawdust beside it.'),
  prop('prop-radio', 450, 'An old shortwave ham radio set with dials and a handheld microphone, wired to a car battery, sitting on a small battered wooden table, a notepad beside it.'),
  prop('prop-collector', 510, 'A rainwater collector: a large blue plastic drum with a stretched tarpaulin funnel on a rough wooden frame feeding into it, held with rope.'),
  prop('prop-garden', 900, 'A wide rectangular raised vegetable bed made of rough planks, about twice as wide as it is deep, filled with dark soil and neat rows of young green vegetable plants.'),
  prop('prop-barricade', 900, 'A long low barricade about three times wider than it is tall: nailed planks, a table on its side, a wardrobe door, sandbags and coils of wire piled together.'),
  prop('prop-crates', 450, 'A small stack of scavenged supplies: two wooden crates, a few cans, a jerrycan and a folded tarp.'),
  // Mapa da região: pintura por cima da planta que o jogo desenha
  {
    id: 'region-map',
    aspect: '4:3',
    width: 1568,
    refs: ['art/ref/region-layout.png'],
    prompt: `Repaint the attached rough city map as a finished, beautiful hand-painted game map of an abandoned Brazilian neighbourhood, keeping the SAME layout and the same camera: top-down view with a slight oblique tilt so building fronts are just visible, north at the top. Keep the wide river running vertically through the middle with its five small bridges, the regular grid of streets, and the city blocks in the same places. Fill the blocks with dense, varied small buildings: houses with terracotta tile roofs, flat concrete roofs with blue water tanks, corrugated metal roofs, backyards, walls, trees, a small overgrown square, vacant lots. The streets are cracked asphalt with abandoned cars, debris, weeds and fallen wires; the river is dark green water with muddy overgrown banks. Months after a collapse: no people, no lights, no smoke. Remove every label, icon, marker, outline, highlight, question mark, dark cloud and any piece of user interface from the reference: plain buildings in their place. Even soft overcast daylight, the whole map evenly visible, slightly darker toward the edges. ${STYLE}`,
  },
  // Cenários em alta resolução: a pintura aprovada, refeita em 4K sem mudar nada de lugar.
  hd('shelter-hd', 'shelter', 'art/raw/shelter.jpg'),
  hd('region-map-hd', 'region-map', 'art/raw/region-map.jpg'),
  // Telas
  scene('title', 'Wide establishing shot of an old two-storey house with a walled yard in a ruined Brazilian neighbourhood at night, one window glowing with candlelight, boarded windows, power lines hanging, dead city skyline far behind under a heavy sky. Dark empty space in the upper third of the image.'),
  scene('door', 'View from inside a dark hallway looking at a barricaded front door of an old house; through a gap in the boards, the silhouettes of strangers wait outside in grey daylight. A hand-made barricade of planks and a chair, a lantern on the floor.'),
  scene('raiders', 'Night. Seen from a boarded upstairs window: several armed men with improvised weapons and a torch standing at the iron gate of the yard below, faces hidden in shadow, threatening.'),
  scene('ending-boat', 'Dawn at an old wooden river pier on the edge of a ruined Brazilian city. A small group of exhausted survivors with backpacks, seen from behind, walks toward a waiting old fishing boat; mist on the water, the first warm light breaking through, the dead city behind them.'),
  scene('ending-dead', 'The inside of an abandoned shelter room in an old house, some time later: an overturned chair, a cold burnt-out candle, a notebook left open on the floor, the front door hanging open to grey light, dust settled on everything. Nobody there.'),
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const raw = (id) => `art/raw/${id}.jpg`;
const light = (id) => `public/art/${id}.webp`;
/** Trabalhos cuja versão leve é feita por outro (o de alta resolução). */
const SUPERSEDED = new Set(['shelter', 'region-map']);

async function generate(job) {
  const parts = [{ text: job.prompt }];
  for (const ref of job.refs ?? []) {
    parts.push({ inlineData: { mimeType: MIME[extname(ref)] ?? 'image/png', data: readFileSync(ref).toString('base64') } });
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: job.aspect, ...(job.size ? { imageSize: job.size } : {}) } },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${json.error?.message ?? ''}`);
  const usd = charge(job.id, json.usageMetadata);
  const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!img) throw new Error(`sem imagem na resposta (${json.candidates?.[0]?.finishReason ?? json.promptFeedback?.blockReason ?? '?'})`);
  // Guarda sempre como JPEG, seja qual for o formato devolvido.
  await sharp(Buffer.from(img.data, 'base64')).jpeg({ quality: 92 }).toFile(raw(job.id));
  return usd;
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const wanted = args.filter((a) => !a.startsWith('--'));
// Trabalhos "shelved" (cenário pintado, fora do jogo) só rodam se pedidos pelo nome.
const jobs = JOBS.filter((j) => (wanted.length ? wanted.includes(j.id) : !j.shelved));
const report = () =>
  console.log(
    `gasto estimado: US$ ${spent().toFixed(2)} de US$ ${BUDGET.toFixed(2)} de teto · ${ledger.entries.length} imagem(ns) pagas` +
      (CREDITS ? ` · saldo informado US$ ${CREDITS.toFixed(2)} → restam cerca de US$ ${(CREDITS - spent()).toFixed(2)}` : ' · saldo desconhecido (defina GEMINI_CREDITS_USD no .env.local)'),
  );

/** Tira o fundo magenta: transparência pela distância de cor, com borda suave e sem franja rosa. */
async function cutout(src, dest, width) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => (y * info.width + x) * 4;
  // A cor do fundo vem dos quatro cantos, já que o modelo nunca acerta o magenta exato.
  const bg = [0, 0, 0];
  for (const [x, y] of [[4, 4], [info.width - 5, 4], [4, info.height - 5], [info.width - 5, info.height - 5]]) {
    for (let c = 0; c < 3; c++) bg[c] += data[px(x, y) + c] / 4;
  }
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    // Quanto "magenta" o pixel tem: vermelho e azul altos, verde baixo.
    const pink = Math.min(r, b) - g;
    let a = Math.max(0, Math.min(1, (dist - 60) / 70));
    if (pink > 90) a = Math.min(a, Math.max(0, 1 - (pink - 90) / 60));
    if (a > 0 && pink > 20) {
      // Franja: puxa vermelho e azul para perto do verde.
      const cut = (pink - 20) * 0.9;
      data[i] = Math.max(0, r - cut);
      data[i + 2] = Math.max(0, b - cut);
    }
    data[i + 3] = Math.round(a * 255);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 1 }).resize({ width }).webp({ quality: 88, alphaQuality: 90 }).toFile(dest);
}

if (args.includes('--cost')) {
  report();
  process.exit(0);
}

mkdirSync('art/raw', { recursive: true });
mkdirSync('public/art', { recursive: true });
console.log(`modelo ${MODEL} · ${jobs.length} trabalho(s)`);
for (const job of jobs) {
  if (force || !existsSync(raw(job.id))) {
    if (!KEY) throw new Error('Falta GEMINI_API_KEY no .env.local');
    if (spent() + (job.size === '4K' ? 0.26 : 0.15) > BUDGET) {
      console.log(`! ${job.id}: teto de US$ ${BUDGET} atingido. Aumente ART_BUDGET_USD no .env.local para continuar.`);
      continue;
    }
    try {
      const t = Date.now();
      const usd = await generate(job);
      console.log(`+ ${job.id} (${((Date.now() - t) / 1000).toFixed(0)}s, US$ ${usd.toFixed(3)})`);
    } catch (e) {
      console.log(`! ${job.id}: ${e.message}`);
      continue;
    }
  }
  if (existsSync(raw(job.id)) && !SUPERSEDED.has(job.id)) {
    if (job.key) await cutout(raw(job.id), light(job.id), job.width);
    else await sharp(raw(job.id)).resize({ width: job.width }).webp({ quality: 82 }).toFile(light(job.as ?? job.id));
    if (job.large) await sharp(raw(job.id)).resize({ width: job.large }).webp({ quality: 84 }).toFile(light(`${job.id}-lg`));
  }
}
report();

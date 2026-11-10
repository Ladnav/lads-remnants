import Phaser from 'phaser';

/**
 * Ícones do jogo em pixel art, desenhados por código (mesma ideia de sprites.ts).
 * Cada ícone é uma grade 10×10; o contorno escuro é posto sozinho em volta do desenho.
 * Substituem os emojis, que mudam de cara em cada aparelho e destoam do resto.
 */
const PALETTE: Record<string, string> = {
  k: '#17140f',
  w: '#e8e2d4',
  g: '#a3a29c',
  G: '#5f5e5a',
  b: '#5f9fd0',
  B: '#35668f',
  r: '#c8452f',
  R: '#8a2c1e',
  y: '#e0b04a',
  o: '#d9772b',
  n: '#8a5a34',
  N: '#5a3a22',
  e: '#7fae4f',
  E: '#4a7434',
  p: '#d9a27a',
  t: '#c9b48a',
};
const OUTLINE = '#17140f';

const ICONS: Record<string, string[]> = {
  water: ['....b.....', '....b.....', '...bbb....', '...bbb....', '..bbbbb...', '..bwbbb...', '.bwbbbbB..', '.bbbbbbB..', '..bbbBB...', '...BBB....'],
  food: ['..gggggg..', '.gwwwwwwg.', '..gggggg..', '..rrrrrr..', '..rrwwrr..', '..rwwwwr..', '..rrwwrr..', '..rrrrrr..', '..gggggg..', '..........'],
  meds: ['...wwww...', '...wwww...', '..oooooo..', '..owwwwo..', '..owrrwo..', '..orrrro..', '..owrrwo..', '..owwwwo..', '..oooooo..', '..........'],
  bandage: ['..........', '.tt....tt.', '.ttt..ttt.', '..tttttt..', '...twwt...', '...twwt...', '..tttttt..', '.ttt..ttt.', '.tt....tt.', '..........'],
  wood: ['..........', '..nnnnnn..', '.ntnnnnnN.', '.nnnnnnnN.', '..NNNNNN..', '..nnnnnn..', '.ntnnnnnN.', '.nnnnnnnN.', '..NNNNNN..', '..........'],
  scrap: ['..........', '...gggg...', '..gggggg..', '.ggGGGGgg.', '.ggG..Ggg.', '.ggG..Ggg.', '.ggGGGGgg.', '..gggggg..', '...gggg...', '..........'],
  parts: ['....gg....', '.g..gg..g.', '..gggggg..', '..gGGGGg..', 'gggG..Gggg', 'gggG..Gggg', '..gGGGGg..', '..gggggg..', '.g..gg..g.', '....gg....'],
  components: ['..........', '.EEEEEEEE.', '.EeyeeeeE.', '.EeeeGGeE.', '.EyeeGGeE.', '.EeeeeeeE.', '.EeGGeyeE.', '.EeGGeeeE.', '.EEEEEEEE.', '..y.y.y.y.'],
  fuel: ['..........', '..rr.RRR..', '.rrrrrrr..', '.rrrrrrrr.', '.rrwrrwrr.', '.rrrwwrrr.', '.rrrwwrrr.', '.rrwrrwrr.', '.rrrrrrrR.', '.RRRRRRRR.'],
  ammo: ['....yy....', '...yyyy...', '...yyyy...', '...oooo...', '...yyyy...', '...ywyy...', '...ywyy...', '...yyyy...', '...yyyy...', '...oooo...'],
  knife: ['.......gw.', '......gwg.', '.....gwg..', '....gwg...', '...gwg....', '..NNg.....', '.nnN......', 'nnN.......', 'nN........', '..........'],
  waste: ['....GG....', '...GGGG...', '....GG....', '..GGGGGG..', '.GGgGGGGG.', '.GGgGGGGG.', '.GGGGGGGG.', '.GGGGGgGG.', '..GGGGGG..', '..........'],
  hammer: ['..gggggg..', '..gggggg..', '..gggggg..', '....nn....', '....nn....', '....nn....', '....nn....', '....nn....', '....nn....', '....NN....'],
  bed: ['..........', '..........', '.n........', '.nww......', '.nwwbbbbb.', '.nbbbbbbb.', '.nnnnnnnn.', '.n......n.', '.n......n.', '..........'],
  bucket: ['..........', '.g......g.', '.gbbbbbbg.', '.bbbbbbbb.', '.bbwbbbbB.', '..bbbbbB..', '..bbbbbB..', '..bbbbbB..', '...bbbB...', '..........'],
  flask: ['...wwww...', '....ww....', '....ww....', '....ww....', '...wwww...', '..wbbbbw..', '.wbbbbbbw.', '.wbbwbbbw.', '.wbbbbbbw.', '..wwwwww..'],
  fire: ['....o.....', '....oo....', '...ooo..o.', '..oooo.oo.', '..oyooooo.', '.ooyyoooo.', '.oyyyyooo.', '.oywwyyoo.', '..oywwyo..', '...oooo...'],
  sprout: ['..........', '.ee....ee.', '.eee..eee.', '..eeeEee..', '...eEee...', '....E.....', '....E.....', '..nnEnnn..', '.nnnnnnnn.', '..........'],
  toilet: ['..........', '..wwww....', '..wwww....', '..wwww....', '..wwwwwww.', '.wwwwwwww.', '.wggggggw.', '..wwwwww..', '...wwww...', '...wwww...'],
  bricks: ['..........', '.rrrr.rrr.', '.rrrr.rrr.', '..........', '.rr.rrrr.r', '.rr.rrrr.r', '..........', '.rrrr.rrr.', '.rrrr.rrr.', '..........'],
  radio: ['.......g..', '......g...', '.....g....', '.NNNNNNNN.', '.NggggnyN.', '.NggggnnN.', '.NggggnyN.', '.NnnnnnnN.', '.NNNNNNNN.', '..........'],
  map: ['..........', '.tt.tttt..', '.tttttttt.', '.tEtttrtt.', '.tEEttttt.', '.ttEtbbtt.', '.tttttbtt.', '.trtttbtt.', '.tttttttt.', '..tt.ttt..'],
  cart: ['..........', 'g.........', '.gggggggg.', '.gwgwgwgg.', '.gwgwgwg..', '.ggggggg..', '..g.......', '..gggggg..', '..G....G..', '.GG...GG..'],
  wrench: ['......gg..', '.....gg...', '.....gg.g.', '.....gggg.', '....ggg...', '...ggg....', '..ggg.....', '.ggg......', 'ggg.......', 'gg........'],
  hospital: ['..........', '.wwwwwwww.', '.wwwrrwww.', '.wwrrrrww.', '.wwrrrrww.', '.wwwrrwww.', '.wwwwwwww.', '.wgwwwwgw.', '.wgwNNwgw.', '.wwwNNwww.'],
  badge: ['..........', '.BBBBBBBB.', '.BbbbbbbB.', '.BbbyybbB.', '.BbyyyybB.', '.BbbyybbB.', '.BbybbybB.', '..BbbbbB..', '...BbbB...', '....BB....'],
  home: ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'rrrrrrrrrr', '.tttttttt.', '.ttNNttwt.', '.ttNNttwt.', '.ttNNtttt.', '.ttNNtttt.'],
  rock: ['..........', '..........', '...gggg...', '..gggggg..', '.ggwgggGg.', '.gggggGGg.', '.ggggGGGg.', '..gGGGGG..', '..........', '..........'],
  clock: ['...gggg...', '..gwwwwg..', '.gwwwkwwg.', '.gwwwkwwg.', '.gwwwkkkg.', '.gwwwwwwg.', '.gwwwwwwg.', '..gwwwwg..', '...gggg...', '..........'],
  zombie: ['..EEEEEE..', '.EeeeeeeE.', '.eeeeeeee.', '.ekkeekke.', '.ereeeere.', '.eeeeeeee.', '.eekkkkee.', '.eekwkwee.', '..eeeeee..', '...E..E...'],
  horn: ['..........', '......oo..', '....oooo..', '.ooooooo.w', '.ooooooo..', '.ooooooo.w', '....oooo..', '.NN...oo..', '.NN.......', '..........'],
  pack: ['...NNNN...', '..N....N..', '.nnnnnnnn.', '.nnnnnnnn.', '.nNNNNNNn.', '.nnnnnnnn.', '.nnttttnn.', '.nntnntnn.', '.nnttttnn.', '..nnnnnn..'],
  skull: ['..wwwwww..', '.wwwwwwww.', '.wwwwwwww.', '.wkkwwkkw.', '.wkkwwkkw.', '.wwwkkwww.', '..wwwwww..', '..wkwkww..', '..wwwwww..', '..........'],
  siren: ['....r.....', '.r..r..r..', '..........', '...rrrr...', '..rrwrrr..', '..rwrrrr..', '..rrrrrr..', '..rrrrrr..', '.GGGGGGGG.', '.GGGGGGGG.'],
  sick: ['..eeeeee..', '.eeeeeeee.', '.ekkeekke.', '.eeeeeeee.', '.eeeeeeee.', '.eekkkkee.', '.eeeeeewr.', '.eeeeeewe.', '..eeeeee..', '..........'],
  anger: ['..........', '..rr..rr..', '..r....r..', '....rr....', '....rr....', '..r....r..', '..rr..rr..', '..........', '..........', '..........'],
  sad: ['..yyyyyy..', '.yyyyyyyy.', '.ykkyykky.', '.yyyyyyyy.', '.yyyyyyyy.', '.yyykkyyy.', '.yykyykyy.', '.yyyyyyyy.', '..yyyyyy..', '..........'],
  sleep: ['..........', '.....wwww.', '.......w..', '......w...', '.wwww.wwww', '...w......', '..w.......', '.wwww.....', '..........', '..........'],
  eye: ['..........', '..........', '..wwwwww..', '.wwbbbbww.', 'wwbbkkbbww', 'wwbbkkbbww', '.wwbbbbww.', '..wwwwww..', '..........', '..........'],
  door: ['..nnnnnn..', '..nnnnnn..', '..nNNNNn..', '..nNNNNn..', '..nnnnnn..', '..nnnnyn..', '..nNNNNn..', '..nNNNNn..', '..nNNNNn..', '..nnnnnn..'],
  book: ['..........', '.nn....nn.', '.nwwnnwwn.', '.nwwwwwwn.', '.nwgwwgwn.', '.nwwwwwwn.', '.nwgwwgwn.', '.nwwwwwwn.', '.nnnnnnnn.', '..........'],
  moon: ['...yyy....', '..yyy.....', '.yyy......', '.yyy......', '.yyy......', '.yyy......', '.yyyy...y.', '..yyyyyyy.', '...yyyyy..', '..........'],
  sun: ['....y.....', '.y..y..y..', '..y...y...', '...yyy....', 'yy.yyy.yy.', '...yyy....', '..y...y...', '.y..y..y..', '....y.....', '..........'],
  rain: ['..gggg....', '.gggggggg.', 'gggggggggg', 'gggggggggg', '.gggggggg.', '..........', '.b..b..b..', 'b..b..b...', '..........', '.b..b..b..'],
  people: ['..........', '..pp..pp..', '..pp..pp..', '..........', '.bbbbrrrr.', '.bbbbrrrr.', '.bbbbrrrr.', '.bbbbrrrr.', '..........', '..........'],
  cloud: ['..........', '...www....', '..wwwwww..', '.wwwwwwww.', 'wwwwwwwwww', 'wwwwwwwwww', '.wwwwwwww.', '..........', '..........', '..........'],
  disk: ['.BBBBBBBB.', '.BwwwwwBB.', '.BwwwwwBB.', '.BwwwwwBB.', '.BBBBBBBB.', '.BBBBBBBB.', '.BBggggBB.', '.BBgGggBB.', '.BBgGggBB.', '.BBBBBBBB.'],
  car: ['..........', '..........', '...rrrr...', '..rwwrwr..', '.rrrrrrrr.', 'rrrrrrrrrr', 'ryrrrrrryr', '.GG....GG.', '.GG....GG.', '..........'],
  repeat: ['..........', '..bbbbbb..', '.b......b.', '.b.....bbb', '.b......b.', '.b......b.', 'bbb.....b.', '.b......b.', '..bbbbbb..', '..........'],
  heart: ['..........', '.yy...yy..', 'yyyy.yyyy.', 'yyyyyyyyy.', 'yyyyyyyyy.', '.yyyyyyy..', '..yyyyy...', '...yyy....', '....y.....', '..........'],
  bolt: ['.....yy...', '....yy....', '...yy.....', '..yyyyyy..', '.....yy...', '....yy....', '...yy.....', '..yy......', '.y........', '..........'],
};

/** Variações de cor de um mesmo desenho. */
const recolor = (name: string, swap: Record<string, string>): string[] => ICONS[name].map((row) => [...row].map((c) => swap[c] ?? c).join(''));
ICONS.dirtyWater = recolor('water', { b: 'n', B: 'N', w: 't' });
ICONS.blood = recolor('water', { b: 'r', B: 'R' });

/** Qual ícone entra no lugar de cada emoji que os dados e os textos do jogo usam. */
const BY_EMOJI: Record<string, string> = {
  '💧': 'water', '🟤': 'dirtyWater', '🥫': 'food', '💊': 'meds', '🩹': 'bandage', '🪵': 'wood', '🔩': 'scrap', '⚙': 'parts',
  '📟': 'components', '⛽': 'fuel', '🔸': 'ammo', '🔪': 'knife', '🪰': 'waste', '🛠': 'hammer', '🔨': 'hammer', '🛏': 'bed',
  '🪣': 'bucket', '🧪': 'flask', '🔥': 'fire', '🌱': 'sprout', '🚽': 'toilet', '🧱': 'bricks', '📻': 'radio', '🗺': 'map',
  '🛒': 'cart', '🔧': 'wrench', '🏥': 'hospital', '🚓': 'badge', '🏠': 'home', '🪨': 'rock', '⏱': 'clock', '🧟': 'zombie',
  '📣': 'horn', '🎒': 'pack', '💀': 'skull', '🚨': 'siren', '🩸': 'blood', '🤒': 'sick', '💢': 'anger', '🍽': 'food',
  '😞': 'sad', '😟': 'sad', '💤': 'sleep', '👁': 'eye', '🚪': 'door', '📖': 'book', '🌙': 'moon', '☀': 'sun', '🌧': 'rain',
  '👥': 'people', '☁': 'cloud', '💾': 'disk', '🚗': 'car', '🔁': 'repeat', '💛': 'heart', '⚡': 'bolt',
};
const EMOJI = new RegExp(`(${Object.keys(BY_EMOJI).join('|')})\\uFE0F?`, 'gu');

const GRID = 12;
/** Pixels de tela por pixel do desenho: sobra resolução para o ícone ser mostrado em vários tamanhos. */
const SCALE = 3;

function paint(name: string): HTMLCanvasElement {
  const rows = ICONS[name] ?? ICONS.scrap;
  const filled = (x: number, y: number) => (rows[y - 1]?.[x - 1] ?? '.') !== '.';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRID * SCALE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = rows[y - 1]?.[x - 1] ?? '.';
      if (c !== '.') ctx.fillStyle = PALETTE[c] ?? OUTLINE;
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ctx.fillStyle = OUTLINE;
      else continue;
      ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }
  }
  return canvas;
}

const urls = new Map<string, string>();
/** Imagem (data URL) do ícone. */
export function iconUrl(name: string): string {
  let url = urls.get(name);
  if (!url) urls.set(name, (url = paint(name).toDataURL()));
  return url;
}

/** Nome do ícone que substitui um emoji, se houver. */
export const iconFor = (emoji: string): string | null => BY_EMOJI[emoji.replace(/️/g, '')] ?? null;

/**
 * Troca por ícones os emojis que aparecem nos textos de um pedaço da página.
 * Caixas de seleção ficam como estão: o navegador não desenha imagem dentro delas.
 */
export function iconize(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    EMOJI.lastIndex = 0;
    if (EMOJI.test(text.data) && !text.parentElement?.closest('select')) found.push(text);
  }
  for (const text of found) {
    const frag = document.createDocumentFragment();
    let last = 0;
    EMOJI.lastIndex = 0;
    for (const m of text.data.matchAll(EMOJI)) {
      if (m.index > last) frag.append(text.data.slice(last, m.index));
      const img = document.createElement('img');
      img.className = 'ico';
      img.src = iconUrl(BY_EMOJI[m[1]]);
      img.alt = m[0];
      frag.append(img);
      last = m.index + m[0].length;
    }
    if (last < text.data.length) frag.append(text.data.slice(last));
    text.replaceWith(frag);
  }
}

/** O mesmo ícone como textura do Phaser, para usar dentro das cenas. */
export function ensureIcon(scene: Phaser.Scene, name: string): string {
  const key = `ico-${name}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, paint(name));
  return key;
}

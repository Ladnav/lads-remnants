import type { ItemId } from './items';

export type ResourceId =
  | 'water'
  | 'dirtyWater'
  | 'food'
  | 'meds'
  | 'bandages'
  | 'scrap'
  | 'wood'
  | 'parts'
  | 'components'
  | 'fuel'
  | 'ammo'
  | 'weapons'
  | 'waste';

export type Cost = Partial<Record<ResourceId, number>>;

export const RESOURCES: Record<ResourceId, { name: string; icon: string }> = {
  water: { name: 'Água limpa', icon: '💧' },
  dirtyWater: { name: 'Água suja', icon: '🟤' },
  food: { name: 'Comida', icon: '🥫' },
  meds: { name: 'Remédios', icon: '💊' },
  bandages: { name: 'Bandagens', icon: '🩹' },
  scrap: { name: 'Sucata', icon: '🔩' },
  wood: { name: 'Madeira', icon: '🪵' },
  parts: { name: 'Peças', icon: '⚙️' },
  components: { name: 'Componentes', icon: '📟' },
  fuel: { name: 'Combustível', icon: '⛽' },
  ammo: { name: 'Munição', icon: '🔸' },
  weapons: { name: 'Armas', icon: '🔪' },
  waste: { name: 'Resíduos', icon: '🪰' },
};

/** Como o loot da incursão vira recurso no abrigo. */
export const ITEM_TO_RESOURCES: Record<ItemId, Cost> = {
  canned_food: { food: 2 },
  water: { water: 2 },
  medicine: { meds: 1 },
  bandage: { bandages: 1 },
  scrap: { scrap: 1 },
  wood: { wood: 1 },
  parts: { parts: 1 },
  ammo: { ammo: 2 },
  fuel: { fuel: 1 },
  crowbar: { weapons: 1 },
  components: { components: 1 },
  map_note: {},
};

export type BuildingId = 'workbench' | 'rainCollector' | 'filter' | 'stove' | 'garden' | 'bed' | 'latrine' | 'barricade';
export type RecipeId = BuildingId | 'weapon';

export interface RecipeDef {
  name: string;
  icon: string;
  description: string;
  cost: Cost;
  /** Horas de trabalho de um sobrevivente na tarefa "Construir". */
  hours: number;
  needsWorkbench: boolean;
  max: number;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  workbench: { name: 'Bancada', icon: '🛠️', description: 'Necessária para quase tudo.', cost: { wood: 3, scrap: 2 }, hours: 3, needsWorkbench: false, max: 1 },
  bed: { name: 'Cama', icon: '🛏️', description: 'Sono melhor: recupera mais cansaço e humor.', cost: { wood: 3 }, hours: 2, needsWorkbench: false, max: 6 },
  rainCollector: { name: 'Coletor de chuva', icon: '🪣', description: 'Junta água suja, mais ainda em dias de chuva.', cost: { wood: 2, scrap: 2 }, hours: 3, needsWorkbench: true, max: 2 },
  filter: { name: 'Filtro de água', icon: '🧪', description: 'Transforma água suja em limpa (1 a cada 2h).', cost: { scrap: 2, parts: 2 }, hours: 4, needsWorkbench: true, max: 1 },
  stove: { name: 'Fogão', icon: '🔥', description: 'Refeições rendem mais (0,6 de comida) e animam.', cost: { scrap: 3, parts: 1 }, hours: 4, needsWorkbench: true, max: 1 },
  garden: { name: 'Horta', icon: '🌱', description: 'Produz comida com trabalho. Bebe 1 água por dia.', cost: { wood: 3, scrap: 1 }, hours: 4, needsWorkbench: true, max: 2 },
  latrine: { name: 'Latrina', icon: '🚽', description: 'Metade dos resíduos gerados.', cost: { wood: 2, scrap: 1 }, hours: 2, needsWorkbench: true, max: 1 },
  barricade: { name: 'Barricada', icon: '🧱', description: 'Menos ataques noturnos e defesa melhor.', cost: { wood: 4, scrap: 2 }, hours: 3, needsWorkbench: true, max: 3 },
  weapon: { name: 'Arma improvisada', icon: '🔪', description: 'Uma lança ou faca para quem fica de guarda.', cost: { scrap: 2, wood: 1 }, hours: 2, needsWorkbench: true, max: 99 },
};

export type TaskId = 'rest' | 'craft' | 'garden' | 'clean' | 'guard';

export const TASKS: Record<TaskId, { name: string; description: string }> = {
  rest: { name: 'Descansar', description: 'Recupera cansaço e um pouco de humor.' },
  craft: { name: 'Construir', description: 'Trabalha no projeto atual da bancada.' },
  garden: { name: 'Cuidar da horta', description: 'Produz comida (precisa de horta).' },
  clean: { name: 'Limpar', description: 'Reduz resíduos e o risco de doença.' },
  guard: { name: 'Vigiar', description: 'Fica acordado de noite defendendo a porta.' },
};

export type RiskRule = 'cautious' | 'balanced' | 'greedy';

export const RISK_RULES: Record<RiskRule, { name: string; description: string; loot: number; danger: number }> = {
  cautious: { name: 'Cautelosa', description: 'Volta ao primeiro sinal de perigo.', loot: 2, danger: 0.5 },
  balanced: { name: 'Equilibrada', description: 'Volta com a mochila pela metade ou se alguém se ferir.', loot: 5, danger: 1 },
  greedy: { name: 'Gananciosa', description: 'Só volta com a mochila cheia.', loot: 6, danger: 1.8 },
};

export interface LocationDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  danger: 1 | 2 | 3;
  loot: readonly ItemId[];
  /** Posição no mapa da região (em tiles). */
  pos: [number, number];
  /** Zumbis no início de uma incursão ativa. */
  zombies: [number, number];
  /** Conhecido desde o dia 1; os outros são revelados por mapas achados em incursões ativas. */
  known: boolean;
}

export const SHELTER_POS: [number, number] = [5, 15];

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'market', name: 'Mercado Bom Preço', icon: '🛒', description: 'Comida e água, se sobrou alguma.', danger: 1, loot: ['canned_food', 'canned_food', 'canned_food', 'water', 'water', 'wood', 'scrap', 'bandage'], pos: [10, 11], zombies: [3, 5], known: true },
  { id: 'garage', name: 'Oficina do Seu Zé', icon: '🔧', description: 'Sucata, peças, combustível.', danger: 2, loot: ['scrap', 'scrap', 'parts', 'parts', 'fuel', 'wood', 'crowbar'], pos: [7, 5], zombies: [4, 6], known: true },
  { id: 'pharmacy', name: 'Farmácia da Esquina', icon: '💊', description: 'Remédios e bandagens. Muita gente pensou nisso.', danger: 2, loot: ['medicine', 'bandage', 'bandage', 'water', 'components'], pos: [18, 8], zombies: [4, 6], known: false },
  { id: 'hospital', name: 'Hospital Municipal', icon: '🏥', description: 'Tudo o que se precisa, e tudo o que se teme.', danger: 3, loot: ['medicine', 'medicine', 'components', 'bandage', 'parts', 'water'], pos: [21, 5], zombies: [6, 8], known: false },
  { id: 'police', name: 'Delegacia', icon: '🚓', description: 'Munição e armas. Os mortos ainda estão de farda.', danger: 3, loot: ['ammo', 'ammo', 'crowbar', 'components', 'canned_food'], pos: [22, 14], zombies: [6, 8], known: false },
];

export function locationById(id: string): LocationDef {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Local desconhecido: ${id}`);
  return l;
}

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
  crowbar: {},
  components: { components: 1 },
  map_note: {},
  vault_key: {},
  first_aid: { meds: 2, bandages: 2 },
  car_battery: { components: 2 },
  ammo_box: { ammo: 8 },
  toolkit: { parts: 4, scrap: 2 },
  antibiotics: { meds: 3 },
  // Equipamento vai para o arsenal (sim/shelter/core.ts stashItem), não para o estoque.
  knife: {},
  bat: {},
  machete: {},
  revolver: {},
  shotgun: {},
  pack_hiking: {},
  pack_military: {},
  jacket: {},
  vest: {},
  flashlight: {},
  lockpick_kit: {},
  soft_shoes: {},
  // Chaves ficam guardadas com os usos (sim/shelter/core.ts stashItem).
  key_manager: {},
  key_workshop: {},
  card_storage: {},
  key_armory: {},
};

/** Quantas vezes cada chave abre a sala dela antes de gastar. */
export const KEY_USES: Partial<Record<ItemId, number>> = { key_manager: 3, key_workshop: 3, card_storage: 2, key_armory: 2 };

export type BuildingId = 'workbench' | 'rainCollector' | 'filter' | 'stove' | 'garden' | 'bed' | 'latrine' | 'barricade' | 'radio';
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
  radio: { name: 'Rádio', icon: '📻', description: 'Capta transmissões à noite. Se alguém lá fora estiver chamando, é por aqui que vocês vão saber.', cost: { parts: 4, scrap: 4 }, hours: 8, needsWorkbench: true, max: 1 },
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
  /** O prêmio trancado do local, só na incursão ativa: abre com a chave achada lá dentro ou arrombando. */
  prize: { name: string; loot: readonly ItemId[] };
  /** Sala especial com porta de aço: abre com uma chave achada em outro local. */
  room?: { name: string; key: ItemId; loot: readonly ItemId[] };
}

export const SHELTER_POS: [number, number] = [5, 15];

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'market', name: 'Supermercado Sartori', icon: '🛒', description: 'Comida e água. Já foi saqueado, mas sempre sobra alguma coisa nos fundos.', danger: 1, loot: ['canned_food', 'canned_food', 'canned_food', 'water', 'water', 'wood', 'scrap', 'bandage', 'pack_hiking', 'knife', 'key_workshop'], pos: [10, 11], zombies: [3, 5], known: true, room: { name: 'Sala do gerente', key: 'key_manager', loot: ['canned_food', 'medicine', 'antibiotics', 'first_aid', 'components', 'pack_hiking'] }, prize: { name: 'Cofre do gerente', loot: ['canned_food', 'canned_food', 'medicine', 'ammo', 'components', 'water'] } },
  { id: 'garage', name: 'Auto Mecânica do Tião', icon: '🔧', description: 'Sucata, peças e um pouco de gasolina nos galões.', danger: 2, loot: ['scrap', 'scrap', 'parts', 'parts', 'fuel', 'wood', 'crowbar', 'bat', 'lockpick_kit', 'toolkit', 'key_manager'], pos: [7, 5], zombies: [4, 6], known: true, room: { name: 'Depósito da oficina', key: 'key_workshop', loot: ['parts', 'toolkit', 'crowbar', 'bat', 'machete', 'lockpick_kit', 'fuel'] }, prize: { name: 'Armário do Tião', loot: ['parts', 'parts', 'fuel', 'components', 'components', 'crowbar'] } },
  { id: 'pharmacy', name: 'Drogaria São Bento', icon: '💊', description: 'Remédio e curativo. Muita gente teve a mesma ideia.', danger: 2, loot: ['medicine', 'bandage', 'bandage', 'water', 'components', 'first_aid', 'antibiotics', 'key_manager', 'card_storage'], pos: [18, 8], zombies: [4, 6], known: false, prize: { name: 'Armário de controlados', loot: ['medicine', 'medicine', 'medicine', 'bandage', 'components'] } },
  { id: 'hospital', name: 'Santa Casa', icon: '🏥', description: 'Remédio e material de sobra, e o prédio cheio de infectados.', danger: 3, loot: ['medicine', 'medicine', 'components', 'bandage', 'parts', 'water', 'first_aid', 'flashlight', 'antibiotics', 'key_armory'], pos: [21, 5], zombies: [6, 8], known: false, room: { name: 'Almoxarifado', key: 'card_storage', loot: ['medicine', 'antibiotics', 'first_aid', 'vest', 'components', 'flashlight'] }, prize: { name: 'Farmácia interna', loot: ['medicine', 'medicine', 'medicine', 'components', 'components', 'bandage'] } },
  { id: 'police', name: '23º DP', icon: '🚓', description: 'Munição e armas. Os policiais que ficaram de plantão ainda estão lá dentro.', danger: 3, loot: ['ammo', 'ammo', 'crowbar', 'components', 'canned_food', 'revolver', 'vest', 'ammo_box', 'card_storage'], pos: [22, 14], zombies: [6, 8], known: false, room: { name: 'Sala do arsenal', key: 'key_armory', loot: ['revolver', 'ammo_box', 'vest', 'shotgun', 'ammo'] }, prize: { name: 'Arsenal', loot: ['ammo', 'ammo', 'ammo', 'crowbar', 'components', 'medicine', 'revolver', 'vest', 'shotgun', 'pack_military', 'ammo_box'] } },
];

export function locationById(id: string): LocationDef {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Local desconhecido: ${id}`);
  return l;
}

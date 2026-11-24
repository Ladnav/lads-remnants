export type ItemId =
  | 'canned_food'
  | 'water'
  | 'medicine'
  | 'bandage'
  | 'scrap'
  | 'wood'
  | 'parts'
  | 'ammo'
  | 'fuel'
  | 'crowbar'
  | 'components'
  | 'map_note'
  | 'vault_key'
  | 'first_aid'
  | 'car_battery'
  | 'ammo_box'
  | 'toolkit'
  | 'antibiotics'
  // Equipamento (data/gear.ts): vai para o arsenal do abrigo, não vira recurso.
  | 'knife'
  | 'bat'
  | 'machete'
  | 'revolver'
  | 'shotgun'
  | 'pack_hiking'
  | 'pack_military'
  | 'jacket'
  | 'vest'
  | 'flashlight'
  | 'lockpick_kit'
  | 'soft_shoes';

/** Raridade: decide a cor e a chance de aparecer (tabelas em sim/raid/loot.ts). */
export type Rarity = 'comum' | 'incomum' | 'raro' | 'lendario';
export const RARITIES: readonly Rarity[] = ['comum', 'incomum', 'raro', 'lendario'];
export const RARITY_INFO: Record<Rarity, { name: string; color: string }> = {
  comum: { name: 'Comum', color: '#a39c8d' },
  incomum: { name: 'Incomum', color: '#8fbf5a' },
  raro: { name: 'Raro', color: '#5b9bd5' },
  lendario: { name: 'Lendário', color: '#e8c65e' },
};

export interface ItemDef {
  name: string;
  weight: number;
  value: number;
  icon: string;
  rarity: Rarity;
  /** Pista ou chave: não entra no sorteio de saque. */
  special?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  canned_food: { name: 'Enlatado', weight: 1, value: 3, icon: '🥫', rarity: 'comum' },
  water: { name: 'Água', weight: 1, value: 3, icon: '💧', rarity: 'comum' },
  medicine: { name: 'Remédio', weight: 0.5, value: 6, icon: '💊', rarity: 'incomum' },
  bandage: { name: 'Bandagem', weight: 0.5, value: 3, icon: '🩹', rarity: 'comum' },
  scrap: { name: 'Sucata', weight: 2, value: 2, icon: '🔩', rarity: 'comum' },
  wood: { name: 'Madeira', weight: 2, value: 1, icon: '🪵', rarity: 'comum' },
  parts: { name: 'Peças', weight: 1, value: 4, icon: '⚙️', rarity: 'incomum' },
  ammo: { name: 'Munição', weight: 0.5, value: 5, icon: '🔸', rarity: 'raro' },
  fuel: { name: 'Combustível', weight: 3, value: 6, icon: '⛽', rarity: 'incomum' },
  crowbar: { name: 'Pé de cabra', weight: 2, value: 4, icon: '🔧', rarity: 'incomum' },
  components: { name: 'Componentes eletrônicos', weight: 1, value: 8, icon: '📟', rarity: 'raro' },
  map_note: { name: 'Mapa rabiscado', weight: 0, value: 0, icon: '🗺️', rarity: 'raro', special: true },
  vault_key: { name: 'Chave do cofre', weight: 0, value: 0, icon: '🗝️', rarity: 'incomum', special: true },
  first_aid: { name: 'Kit de primeiros socorros', weight: 1, value: 12, icon: '🧰', rarity: 'raro' },
  car_battery: { name: 'Bateria de carro', weight: 3, value: 12, icon: '🔋', rarity: 'raro' },
  ammo_box: { name: 'Caixa de munição', weight: 2, value: 20, icon: '📦', rarity: 'lendario' },
  toolkit: { name: 'Maleta de ferramentas', weight: 3, value: 20, icon: '🧳', rarity: 'lendario' },
  antibiotics: { name: 'Antibiótico', weight: 0.5, value: 18, icon: '💉', rarity: 'lendario' },
  knife: { name: 'Faca improvisada', weight: 0.5, value: 3, icon: '🔪', rarity: 'comum' },
  bat: { name: 'Taco com pregos', weight: 2, value: 5, icon: '🏏', rarity: 'incomum' },
  machete: { name: 'Facão', weight: 1, value: 9, icon: '🗡️', rarity: 'raro' },
  revolver: { name: 'Revólver', weight: 1, value: 14, icon: '🔫', rarity: 'raro' },
  shotgun: { name: 'Espingarda', weight: 3, value: 22, icon: '🔫', rarity: 'lendario' },
  pack_hiking: { name: 'Mochila de trilha', weight: 1, value: 8, icon: '🎒', rarity: 'incomum' },
  pack_military: { name: 'Mochila militar', weight: 1.5, value: 20, icon: '🎒', rarity: 'lendario' },
  jacket: { name: 'Jaqueta de couro', weight: 1, value: 7, icon: '🧥', rarity: 'incomum' },
  vest: { name: 'Colete', weight: 2, value: 14, icon: '🦺', rarity: 'raro' },
  flashlight: { name: 'Lanterna', weight: 0.5, value: 6, icon: '🔦', rarity: 'incomum' },
  lockpick_kit: { name: 'Kit de gazua', weight: 0.5, value: 12, icon: '🪛', rarity: 'raro' },
  soft_shoes: { name: 'Tênis macio', weight: 0.5, value: 6, icon: '👟', rarity: 'incomum' },
};

export interface ContainerDef {
  name: string;
  /** Nível do móvel (1 a 3): quanto mais alto, mais chance de coisa rara. */
  tier: 1 | 2 | 3;
  loot: readonly ItemId[];
  min: number;
  max: number;
}

// Tipos de container do mercado e o que costumam guardar.
export const CONTAINERS: readonly ContainerDef[] = [
  { name: 'Prateleira', tier: 1, loot: ['canned_food', 'canned_food', 'water', 'water', 'wood'], min: 0, max: 3 },
  { name: 'Balcão', tier: 1, loot: ['bandage', 'medicine', 'water', 'ammo', 'knife', 'flashlight'], min: 0, max: 2 },
  { name: 'Caixa de ferramentas', tier: 2, loot: ['scrap', 'parts', 'parts', 'crowbar', 'fuel', 'bat', 'lockpick_kit', 'toolkit', 'car_battery'], min: 1, max: 2 },
  { name: 'Armário', tier: 2, loot: ['components', 'bandage', 'scrap', 'canned_food', 'ammo', 'jacket', 'pack_hiking', 'soft_shoes', 'machete', 'first_aid'], min: 0, max: 2 },
];

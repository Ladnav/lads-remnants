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
  | 'components';

export interface ItemDef {
  name: string;
  weight: number;
  value: number;
  icon: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  canned_food: { name: 'Enlatado', weight: 1, value: 3, icon: '🥫' },
  water: { name: 'Água', weight: 1, value: 3, icon: '💧' },
  medicine: { name: 'Remédio', weight: 0.5, value: 6, icon: '💊' },
  bandage: { name: 'Bandagem', weight: 0.5, value: 3, icon: '🩹' },
  scrap: { name: 'Sucata', weight: 2, value: 2, icon: '🔩' },
  wood: { name: 'Madeira', weight: 2, value: 1, icon: '🪵' },
  parts: { name: 'Peças', weight: 1, value: 4, icon: '⚙️' },
  ammo: { name: 'Munição', weight: 0.5, value: 5, icon: '🔸' },
  fuel: { name: 'Combustível', weight: 3, value: 6, icon: '⛽' },
  crowbar: { name: 'Pé de cabra', weight: 2, value: 4, icon: '🔧' },
  components: { name: 'Componentes eletrônicos', weight: 1, value: 8, icon: '📟' },
};

export interface ContainerDef {
  name: string;
  loot: readonly ItemId[];
  min: number;
  max: number;
}

// Tipos de container do mercado e o que costumam guardar.
export const CONTAINERS: readonly ContainerDef[] = [
  { name: 'Prateleira', loot: ['canned_food', 'canned_food', 'water', 'water', 'wood'], min: 0, max: 3 },
  { name: 'Balcão', loot: ['bandage', 'medicine', 'water', 'ammo'], min: 0, max: 2 },
  { name: 'Caixa de ferramentas', loot: ['scrap', 'parts', 'parts', 'crowbar', 'fuel'], min: 1, max: 2 },
  { name: 'Armário', loot: ['components', 'bandage', 'scrap', 'canned_food', 'ammo'], min: 0, max: 2 },
];

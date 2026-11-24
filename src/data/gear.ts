import type { ItemId } from './items';

/** Os quatro espaços que o sobrevivente leva para a incursão. */
export type Slot = 'weapon' | 'pack' | 'armor' | 'util';

export const SLOT_NAME: Record<Slot, string> = { weapon: 'Arma', pack: 'Mochila', armor: 'Proteção', util: 'Utilitário' };

export interface WeaponStats {
  damage: number;
  /** 0–1 */
  hit: number;
  /** Raio do barulho de cada golpe ou tiro. */
  noise: number;
  /** Arma de fogo: alcance em casas (mira como a pedra). */
  range?: number;
  /** Munição gasta por tiro. */
  ammo?: number;
  /** Espingarda: acerta também quem está colado no alvo, com metade do dano. */
  spread?: boolean;
}

export interface GearDef {
  slot: Slot;
  /** Golpes ou tiros até quebrar (só armas). */
  durability?: number;
  weapon?: WeaponStats;
  /** Mochila: quantos kg cabem. */
  capacity?: number;
  /** Peso a mais no corpo (o colete). */
  burden?: number;
  /** Proteção: chance de uma mordida não ferir (0–1). */
  guard?: number;
  /** Lanterna: casas a mais de visão. */
  sight?: number;
  /** Kit de gazua: fechaduras num turno e o cofre sem chave, quieto. */
  picks?: boolean;
  /** Tênis macio: passos sem barulho, como o traço Silencioso. */
  quiet?: boolean;
  /** O que faz, em uma linha (para a tela de escolha e o arsenal). */
  note: string;
}

/** Lutar de mãos vazias (ou com a arma quebrada). */
export const HANDS: WeaponStats = { damage: 1, hit: 0.7, noise: 4 };
/** Coronhada: arma de fogo usada de perto não gasta bala nem desgaste. */
export const BUTT: WeaponStats = { damage: 1, hit: 0.65, noise: 4 };
/** Mochila escolar de sempre. */
export const BASE_CAPACITY = 10;

export const GEAR: Partial<Record<ItemId, GearDef>> = {
  knife: { slot: 'weapon', durability: 12, weapon: { damage: 1, hit: 0.75, noise: 2 }, note: 'Silenciosa. Dano 1.' },
  bat: { slot: 'weapon', durability: 15, weapon: { damage: 2, hit: 0.7, noise: 4 }, note: 'Dano 2.' },
  crowbar: { slot: 'weapon', durability: 20, weapon: { damage: 2, hit: 0.7, noise: 4 }, note: 'Dano 2. Arromba portas e cofres.' },
  machete: { slot: 'weapon', durability: 18, weapon: { damage: 3, hit: 0.75, noise: 3 }, note: 'Dano 3, pouco barulho.' },
  revolver: { slot: 'weapon', durability: 30, weapon: { damage: 3, hit: 0.85, noise: 10, range: 4, ammo: 1 }, note: 'Atira até 4 casas. Barulho alto, 1 bala por tiro.' },
  shotgun: { slot: 'weapon', durability: 20, weapon: { damage: 4, hit: 0.9, noise: 14, range: 3, ammo: 2, spread: true }, note: 'Até 3 casas, pega quem está colado no alvo. Barulho enorme, 2 balas.' },
  pack_hiking: { slot: 'pack', capacity: 14, note: 'Cabem 14 kg.' },
  pack_military: { slot: 'pack', capacity: 18, note: 'Cabem 18 kg.' },
  jacket: { slot: 'armor', guard: 0.2, note: '1 em cada 5 mordidas não fere.' },
  vest: { slot: 'armor', guard: 0.4, burden: 1, note: '2 em cada 5 mordidas não ferem. Pesa 1 kg.' },
  flashlight: { slot: 'util', sight: 2, note: 'Enxerga 2 casas mais longe.' },
  lockpick_kit: { slot: 'util', picks: true, note: 'Fechadura num turno; abre o cofre sem chave, quieto.' },
  soft_shoes: { slot: 'util', quiet: true, note: 'Passos sem barulho.' },
};

export const isGear = (id: ItemId): boolean => GEAR[id] !== undefined;

/** Um equipamento guardado ou levado: armas lembram o desgaste. */
export interface Worn {
  id: ItemId;
  wear: number;
}

export const fresh = (id: ItemId): Worn => ({ id, wear: GEAR[id]?.durability ?? 0 });

/** O que o sobrevivente leva na incursão. */
export interface Loadout {
  weapon?: Worn;
  pack?: Worn;
  armor?: Worn;
  util?: Worn;
}

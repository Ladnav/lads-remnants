import type { ItemId } from '../../data/items';
import type { TraitId } from '../../data/survivors';

export interface Vec {
  x: number;
  y: number;
}

export type TileKind = 'floor' | 'wall' | 'door' | 'exit';
export type DoorState = 'closed' | 'locked' | 'open' | 'broken';

export interface Tile {
  kind: TileKind;
  door?: DoorState;
  /** Golpes de zumbis numa porta fechada; quebra ao chegar em 3. */
  bash?: number;
  exitId?: string;
  containerId?: number;
}

export interface Container {
  id: number;
  pos: Vec;
  name: string;
  searched: boolean;
  items: ItemId[];
}

export type ZombieState = 'idle' | 'investigating' | 'chasing';

export interface Zombie {
  id: number;
  pos: Vec;
  hp: number;
  state: ZombieState;
  target: Vec | null;
  moveAcc: number;
}

export interface Exit {
  id: string;
  name: string;
  pos: Vec;
  opensAt: number;
  closesAt: number | null;
}

export interface RaidSurvivor {
  id: string;
  name: string;
  traits: TraitId[];
  hp: number;
  maxHp: number;
}

export interface Noise {
  pos: Vec;
  radius: number;
}

export type RaidStatus = 'active' | 'extracted' | 'dead';

export interface RaidState {
  seed: number;
  /** Nome do local, para a interface. */
  site: string;
  emergency: boolean;
  rng: number;
  turn: number;
  width: number;
  height: number;
  tiles: Tile[];
  seen: boolean[];
  player: Vec;
  survivor: RaidSurvivor;
  backpack: ItemId[];
  containers: Container[];
  zombies: Zombie[];
  exits: Exit[];
  spawns: Vec[];
  nextZombieId: number;
  nextSpawnTurn: number;
  /** Ruídos gerados por zumbis (portas sendo golpeadas), aplicados no turno seguinte. */
  pendingNoises: Noise[];
  /** Ruídos do último turno, só para a interface desenhar as ondas. */
  lastNoises: Noise[];
  kills: number;
  status: RaidStatus;
  log: Action[];
}

export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'wait' }
  | { type: 'search'; containerId: number }
  | { type: 'take'; containerId: number; index: number }
  | { type: 'drop'; index: number }
  | { type: 'use'; index: number }
  | { type: 'pick'; x: number; y: number }
  | { type: 'force'; x: number; y: number }
  | { type: 'extract' };

export type EventTone = 'info' | 'good' | 'warn' | 'bad';

export interface RaidEvent {
  text: string;
  tone: EventTone;
}

export type ZombieKind = 'walker' | 'runner' | 'brute';

export interface ZombieDef {
  name: string;
  hp: number;
  /** Tiles por turno quando persegue. */
  speed: number;
  /** Chance de a mordida acertar. */
  bite: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker: { name: 'zumbi', hp: 2, speed: 0.75, bite: 0.5 },
  // Frágil, mas mais rápido que o sobrevivente: não dá para fugir correndo.
  runner: { name: 'corredor', hp: 1, speed: 1.25, bite: 0.4 },
  // Lento e duro: melhor contornar ou distrair do que enfrentar.
  brute: { name: 'brutamontes', hp: 4, speed: 0.5, bite: 0.75 },
};

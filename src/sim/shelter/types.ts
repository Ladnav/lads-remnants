import type { BuildingId, RecipeId, ResourceId, RiskRule, TaskId } from '../../data/shelter';
import type { SurvivorDef, TraitId } from '../../data/survivors';
import type { RaidOptions } from '../raid/raid';
import type { EventTone } from '../raid/types';

export type Emotion = 'ok' | 'triste' | 'deprimido' | 'quebrado';
/** raid: dentro de uma incursão ativa (o jogador está jogando). */
export type SurvivorStatus = 'home' | 'away' | 'raid' | 'dead' | 'gone';

export interface ShelterSurvivor {
  id: string;
  name: string;
  bio: string;
  traits: TraitId[];
  /** 0–100 */
  health: number;
  /** 0–100, maior = pior */
  hunger: number;
  thirst: number;
  fatigue: number;
  /** 0–100, maior = melhor */
  mood: number;
  sick: boolean;
  task: TaskId;
  status: SurvivorStatus;
  /** Expedição em que está escalado (mesmo antes de partir). */
  expeditionId: number | null;
  talkedDay: number;
  brokenHours: number;
  /** Dia da última incursão ativa: só uma por dia por pessoa. */
  raidDay: number;
}

/** Ordem permanente: repetir esta expedição toda noite, enquanto houver gente em condições. */
export interface StandingOrder {
  locationId: string;
  ids: string[];
  risk: RiskRule;
}

export interface Expedition {
  id: number;
  locationId: string;
  survivorIds: string[];
  risk: RiskRule;
  departHour: number;
  returnHour: number;
  departed: boolean;
  /** Alguém ficou encurralado: o jogador pode assumir o controle até a hora da volta. */
  emergency: Emergency | null;
}

export interface Emergency {
  survivorId: string;
  /** pending: esperando o jogador · ai: o jogador deixou a IA resolver · played: o jogador jogou a incursão. */
  state: 'pending' | 'ai' | 'played';
  /** Até quando o jogador pode decidir; passa da hora de volta do resto do grupo. */
  deadline: number;
  /** O resto do grupo já voltou; só o encurralado continua fora. */
  held?: boolean;
}

export type VisitorKind = 'beggar' | 'refugee' | 'trader' | 'conman' | 'bandits';

export interface DilemmaOption {
  id: string;
  label: string;
}

export interface Dilemma {
  id: number;
  kind: VisitorKind;
  title: string;
  text: string;
  options: DilemmaOption[];
  expiresHour: number;
  /** Troca oferecida, quando houver. */
  give?: { resource: ResourceId; amount: number };
  get?: { resource: ResourceId; amount: number };
  recruitId?: string;
}

export interface DiaryEntry {
  hour: number;
  text: string;
  tone: EventTone;
}

export interface ShelterState {
  version: 1;
  seed: number;
  rng: number;
  /** Horas de jogo desde o início. 1 dia de jogo = 24h de jogo = 12h reais. */
  hour: number;
  /** Momento real (ms) que corresponde a `hour`. */
  lastRealMs: number;
  /** Última hora que o jogador viu (para o relatório "enquanto você estava fora"). */
  lastSeenHour: number;
  resources: Record<ResourceId, number>;
  buildings: Record<BuildingId, number>;
  project: { recipe: RecipeId; progress: number } | null;
  survivors: ShelterSurvivor[];
  expeditions: Expedition[];
  dilemmas: Dilemma[];
  diary: DiaryEntry[];
  rationing: boolean;
  raining: boolean;
  gardenProgress: number;
  /** A horta só cresce no dia em que recebeu água. */
  gardenWatered: boolean;
  locationStock: Record<string, number>;
  /** Saqueadores que prometeram voltar esta noite (força extra). */
  banditThreat: number;
  usedRecruits: string[];
  nextId: number;
  /** Locais conhecidos no mapa da região. */
  discovered: string[];
  /** Foto do abrigo da última vez que o jogador olhou (para o saldo do relatório). */
  seenResources: Record<ResourceId, number> | null;
  seenAlive: string[];
  /** Incursão ativa em andamento: a semente vem do servidor e o resultado é conferido no fim. */
  activeRaid: RaidTicket | null;
  /** Locais cujo mapa rabiscado já foi achado (um por local). */
  mapsFound: string[];
  standing: StandingOrder | null;
  /** Próximas construções: começam sozinhas quando houver material. */
  buildQueue: RecipeId[];
  /** Laço entre cada par de sobreviventes ("a|b", ids em ordem): -100 (desafetos) a 100 (amigos). */
  bonds: Record<string, number>;
  /** Horas de rádio já ouvidas, até decifrar a transmissão. */
  signal: number;
  /** O grupo saiu da cidade: fim da história, com quem chegou ao barco. */
  ended: { hour: number; saved: string[] } | null;
}

export interface RaidTicket {
  id: number;
  survivorId: string;
  locationId: string;
  seed: number;
  opts: RaidOptions;
  def: SurvivorDef;
}

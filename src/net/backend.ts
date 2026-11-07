import { abandonRaid, applyCommand, devSkip, finishRaid, newShelter, openShelter, randomSeed, startRaid, type RaidRequest, type ShelterCommand } from '../server/game';
import type { Action } from '../sim/raid/types';
import type { RaidOutcome } from '../sim/shelter/shelter';
import type { RaidTicket, ShelterState } from '../sim/shelter/types';
import { clearSave, loadSave, saveGame } from '../game/save';

/** Toda resposta traz o estado oficial do abrigo; `error` é um aviso de regra do jogo. */
export interface Reply<T = undefined> {
  state: ShelterState;
  error?: string;
  value?: T;
}

export interface Account {
  online: boolean;
  anonymous: boolean;
  email: string | null;
}

/** De onde vem o estado oficial do jogo: o navegador (offline) ou o Supabase (online). */
export interface Backend {
  readonly online: boolean;
  load(): Promise<ShelterState>;
  command(cmd: ShelterCommand): Promise<Reply>;
  startRaid(req: RaidRequest): Promise<Reply<RaidTicket>>;
  finishRaid(raidId: number, actions: Action[]): Promise<Reply<RaidOutcome>>;
  skip(hours: number): Promise<Reply>;
  reset(): Promise<ShelterState>;
  account(): Account;
  linkEmail(email: string): Promise<string>;
  /** Último aviso ao sair da página (marca o que o jogador já viu). */
  leaving(): void;
}

/** Modo offline: as mesmas regras do servidor, rodando no navegador e salvando no localStorage. */
export class LocalBackend implements Backend {
  readonly online = false;
  private state: ShelterState | null = null;

  private current(): ShelterState {
    this.state ??= openShelter(loadSave(), Date.now(), randomSeed());
    return this.state;
  }

  private reply<T>(error?: string, value?: T): Reply<T> {
    saveGame(this.current());
    return { state: this.current(), error, value };
  }

  async load(): Promise<ShelterState> {
    const s = this.current();
    if (s.activeRaid) abandonRaid(s);
    saveGame(s);
    return s;
  }

  async command(cmd: ShelterCommand): Promise<Reply> {
    const r = applyCommand(this.current(), cmd, Date.now());
    return this.reply(r.ok ? undefined : r.error);
  }

  async startRaid(req: RaidRequest): Promise<Reply<RaidTicket>> {
    const r = startRaid(this.current(), req, randomSeed(), Date.now());
    return r.ok ? this.reply(undefined, r.value) : this.reply(r.error);
  }

  async finishRaid(raidId: number, actions: Action[]): Promise<Reply<RaidOutcome>> {
    const r = finishRaid(this.current(), raidId, actions, Date.now());
    return r.ok ? this.reply(undefined, r.value) : this.reply(r.error);
  }

  async skip(hours: number): Promise<Reply> {
    devSkip(this.current(), hours);
    return this.reply();
  }

  async reset(): Promise<ShelterState> {
    clearSave();
    this.state = newShelter(Date.now());
    saveGame(this.state);
    return this.state;
  }

  account(): Account {
    return { online: false, anonymous: true, email: null };
  }

  async linkEmail(): Promise<string> {
    return 'No modo offline o progresso fica só neste navegador.';
  }

  leaving(): void {
    if (this.state) saveGame(this.state);
  }
}

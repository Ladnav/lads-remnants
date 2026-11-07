import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { RaidRequest, ShelterCommand } from '../server/game';
import type { Action } from '../sim/raid/types';
import type { RaidOutcome } from '../sim/shelter/shelter';
import type { RaidTicket, ShelterState } from '../sim/shelter/types';
import type { Account, Backend, Reply } from './backend';

type Body =
  | { action: 'load' }
  | { action: 'reset' }
  | { action: 'command'; cmd: ShelterCommand }
  | { action: 'startRaid'; req: RaidRequest }
  | { action: 'finishRaid'; raidId: number; actions: Action[] }
  | { action: 'skip'; hours: number };

/**
 * Modo online: o servidor (Edge Function "game") é a autoridade. O jogador entra
 * como anônimo e pode vincular um e-mail depois sem perder o abrigo.
 */
export class SupabaseBackend implements Backend {
  readonly online = true;
  private sb: SupabaseClient;
  private session: Session | null = null;

  constructor(
    private url: string,
    private key: string,
  ) {
    this.sb = createClient(url, key);
    this.sb.auth.onAuthStateChange((_e, session) => (this.session = session));
  }

  private async ensureSession(): Promise<void> {
    if (this.session) return;
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    if (this.session) return;
    const { data: anon, error } = await this.sb.auth.signInAnonymously();
    if (error) throw new Error(`Não foi possível entrar: ${error.message}`);
    this.session = anon.session;
  }

  private async call<T>(body: Body): Promise<Reply<T>> {
    await this.ensureSession();
    const res = await fetch(`${this.url}/functions/v1/game`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.key,
        Authorization: `Bearer ${this.session!.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<Reply<T>> & { error?: string };
    if (!res.ok || !json.state) throw new Error(json.error ?? `Servidor respondeu ${res.status}.`);
    return json as Reply<T>;
  }

  async load(): Promise<ShelterState> {
    return (await this.call({ action: 'load' })).state;
  }

  command(cmd: ShelterCommand): Promise<Reply> {
    return this.call({ action: 'command', cmd });
  }

  startRaid(req: RaidRequest): Promise<Reply<RaidTicket>> {
    return this.call({ action: 'startRaid', req });
  }

  finishRaid(raidId: number, actions: Action[]): Promise<Reply<RaidOutcome>> {
    return this.call({ action: 'finishRaid', raidId, actions });
  }

  skip(hours: number): Promise<Reply> {
    return this.call({ action: 'skip', hours });
  }

  async reset(): Promise<ShelterState> {
    return (await this.call({ action: 'reset' })).state;
  }

  account(): Account {
    const u = this.session?.user;
    return { online: true, anonymous: u?.is_anonymous ?? true, email: u?.email ?? null };
  }

  async linkEmail(email: string): Promise<string> {
    await this.ensureSession();
    const { error } = await this.sb.auth.updateUser({ email });
    if (error) return `Não deu: ${error.message}`;
    return `Enviamos um link de confirmação para ${email}. Depois de confirmar, o abrigo fica salvo nesse e-mail.`;
  }

  leaving(): void {
    if (!this.session) return;
    // keepalive deixa a requisição terminar mesmo com a aba fechando.
    void fetch(`${this.url}/functions/v1/game`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: this.key, Authorization: `Bearer ${this.session.access_token}` },
      body: JSON.stringify({ action: 'command', cmd: { type: 'seen' } } satisfies Body),
    }).catch(() => {});
  }
}

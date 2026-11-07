// Teste de fumaça contra o Supabase de verdade: npm run smoke:online
// Entra como anônimo, carrega o abrigo, manda um comando e joga uma incursão curta.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { applyAction, createRaid } from '../src/sim/raid/raid';
import type { RaidTicket, ShelterState } from '../src/sim/shelter/types';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: signIn, error: signErr } = await sb.auth.signInAnonymously();
if (signErr || !signIn.session) throw new Error(`login anônimo falhou: ${signErr?.message}`);
const token = signIn.session.access_token;
console.log('✓ login anônimo', signIn.user?.id.slice(0, 8));

async function call<T = unknown>(body: unknown): Promise<{ state: ShelterState; error?: string; value?: T }> {
  const res = await fetch(`${url}/functions/v1/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const loaded = await call({ action: 'load' });
console.log('✓ load', `dia ${Math.floor(loaded.state.hour / 24) + 1}`, `${loaded.state.survivors.length} sobreviventes`);

const built = await call({ action: 'command', cmd: { type: 'build', recipe: 'workbench' } });
console.log('✓ comando build', built.error ?? `projeto: ${built.state.project?.recipe}`);

const bad = await call({ action: 'command', cmd: { type: 'build', recipe: 'bed' } });
console.log('✓ regra no servidor', bad.error);

const started = await call<RaidTicket>({ action: 'startRaid', req: { survivorId: 'lena', locationId: 'market' } });
const ticket = started.value!;
console.log('✓ ingresso de incursão', `semente ${ticket.seed}`, ticket.opts.site);

const raid = createRaid(ticket.seed, ticket.def, ticket.opts);
applyAction(raid, { type: 'move', dx: 0, dy: 1 });
applyAction(raid, { type: 'extract' });
const finished = await call({ action: 'finishRaid', raidId: ticket.id, actions: raid.log });
console.log('✓ incursão conferida', finished.error ?? finished.value, 'lena:', finished.state.survivors.find((v) => v.id === 'lena')?.status);

const { data: rows, error: rlsErr } = await sb.from('shelters').select('user_id, version').limit(5);
console.log('✓ RLS leitura', rlsErr?.message ?? `${rows?.length} linha(s) visíveis (só a própria)`);
const { error: writeErr } = await sb.from('shelters').update({ hour: 999 }).eq('user_id', signIn.user!.id).select();
const { data: after } = await sb.from('shelters').select('hour').eq('user_id', signIn.user!.id).single();
console.log('✓ RLS escrita bloqueada', writeErr?.message ?? `hour continua ${after?.hour}`);

const skip = await call({ action: 'skip', hours: 6 });
console.log('✓ +6h', skip.error ?? `hora ${skip.state.hour}`);

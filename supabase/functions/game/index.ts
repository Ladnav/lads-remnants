// Edge Function "game": a autoridade do Lads Remnants.
// As regras vêm de src/server/game.ts, empacotadas em _game.js por `npm run build:edge`.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  applyCommand,
  devSkip,
  finishRaid,
  isFinished,
  newShelter,
  openShelter,
  randomSeed,
  resumeShelter,
  startRaid,
} from './_game.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const DEV_TOOLS = Deno.env.get('ALLOW_DEV_TOOLS') === 'true';

// deno-lint-ignore no-explicit-any
type State = any;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: 'Não autenticado.' }, 401);

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));

  // Lê → aplica → grava com checagem de versão; se outra aba gravou no meio, tenta de novo.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: readErr } = await admin
      .from('shelters')
      .select('state, version')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) return json({ error: 'Falha ao ler o abrigo.' }, 500);

    const now = Date.now();
    const saved: State | null = row?.state ?? null;
    let state: State;
    let error: string | undefined;
    let value: unknown;

    switch (body.action) {
      case 'load':
        state = openShelter(saved, now, randomSeed());
        break;
      case 'reset':
        if (saved && !isFinished(resumeShelter(saved, now, 0))) return json({ error: 'A comunidade ainda está viva.' }, 400);
        state = newShelter(now);
        break;
      case 'command': {
        state = resumeShelter(saved, now, randomSeed());
        const r = applyCommand(state, body.cmd, now);
        if (!r.ok) error = r.error;
        break;
      }
      case 'startRaid': {
        state = resumeShelter(saved, now, randomSeed());
        const r = startRaid(state, body.req, randomSeed(), now);
        if (r.ok) value = r.value;
        else error = r.error;
        break;
      }
      case 'finishRaid': {
        state = resumeShelter(saved, now, randomSeed());
        const r = finishRaid(state, Number(body.raidId), body.actions, now);
        if (r.ok) value = r.value;
        else error = r.error;
        break;
      }
      case 'skip':
        state = resumeShelter(saved, now, randomSeed());
        if (DEV_TOOLS) devSkip(state, Number(body.hours) || 0);
        else error = 'Ferramentas de teste desligadas neste servidor.';
        break;
      default:
        return json({ error: 'Ação desconhecida.' }, 400);
    }

    const fields = { state, hour: state.hour, updated_at: new Date().toISOString() };
    if (!row) {
      const { error: insErr } = await admin.from('shelters').insert({ user_id: user.id, ...fields, version: 1 });
      if (insErr) continue; // outra requisição criou primeiro: tenta de novo em cima dela
    } else {
      const { data: updated, error: updErr } = await admin
        .from('shelters')
        .update({ ...fields, version: row.version + 1 })
        .eq('user_id', user.id)
        .eq('version', row.version)
        .select('version');
      if (updErr) return json({ error: 'Falha ao salvar o abrigo.' }, 500);
      if (!updated?.length) continue;
    }
    return json({ state, error, value });
  }
  return json({ error: 'O abrigo está ocupado. Tente de novo.' }, 409);
});

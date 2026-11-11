// Edge Function "tick": o relógio do servidor para quem pediu avisos.
// Chamada pelo pg_cron a cada 15 minutos. Avança o abrigo de cada jogador inscrito
// (as regras vêm de src/server/game.ts, no pacote _game.js) e manda um aviso se algo
// importante aconteceu enquanto ele estava fora.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5';
import { isFinished, tickShelter } from '../game/_game.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** Intervalo mínimo entre execuções: a função é aberta, então não pode ser disparada em rajada. */
const MIN_GAP_MS = 5 * 60 * 1000;

// deno-lint-ignore no-explicit-any
let server: Promise<any> | null = null;
function appServer() {
  server ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS_JSON')!), { extractable: false });
    return webpush.ApplicationServer.new({ contactInformation: Deno.env.get('PUSH_CONTACT')!, vapidKeys });
  })();
  return server;
}

interface Sub {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async () => {
  const now = Date.now();
  const { data: gate } = await admin.from('tick_state').select('last_run').eq('id', 1).maybeSingle();
  if (gate && now - Date.parse(gate.last_run) < MIN_GAP_MS) return json({ skipped: 'cedo demais' });
  await admin.from('tick_state').update({ last_run: new Date(now).toISOString() }).eq('id', 1);

  const { data: subs, error } = await admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth');
  if (error) return json({ error: 'Falha ao ler as inscrições.' }, 500);
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const out = { users: byUser.size, advanced: 0, sent: 0, removed: 0, failed: 0 };
  for (const [userId, list] of byUser) {
    const { data: row } = await admin.from('shelters').select('state, version').eq('user_id', userId).maybeSingle();
    if (!row) continue;
    const { state, changed, notice } = tickShelter(row.state, now);
    if (!changed) continue;
    // Mesma checagem de versão da função "game": se o jogador mexeu no meio, o dele vale.
    const { data: updated } = await admin
      .from('shelters')
      .update({ state, hour: state.hour, updated_at: new Date(now).toISOString(), version: row.version + 1 })
      .eq('user_id', userId)
      .eq('version', row.version)
      .select('version');
    if (!updated?.length) continue;
    out.advanced++;
    if (isFinished(state) && !isFinished(row.state)) {
      await admin.from('play_events').insert({ user_id: userId, kind: state.ended ? 'evacuated' : 'game_over', day: Math.floor(state.hour / 24) + 1, alive: 0, data: { offline: true } });
    }
    if (!notice) continue;
    // deno-lint-ignore no-explicit-any
    let app: any;
    try {
      app = await appServer();
    } catch (e) {
      // Sem as chaves configuradas não há como enviar; o abrigo já foi salvo.
      server = null;
      out.failed += list.length;
      console.error('chaves de aviso ausentes ou inválidas', String(e));
      continue;
    }
    for (const sub of list) {
      try {
        await app.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }).pushTextMessage(JSON.stringify(notice), {});
        out.sent++;
      } catch (e) {
        // Inscrição que o navegador cancelou ou expirou: some da tabela.
        // deno-lint-ignore no-explicit-any
        const err = e as any;
        const status = err?.response?.status;
        if (status === 404 || status === 410 || err?.isGone?.()) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          out.removed++;
        } else {
          out.failed++;
          console.error('push falhou', status ?? String(e));
        }
      }
    }
  }
  return json(out);
});

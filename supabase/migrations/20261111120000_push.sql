-- Avisos no celular (Fase 4b).
-- Cada aparelho que aceita avisos grava aqui a inscrição que o navegador dá a ele.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "jogador vê as próprias inscrições"
  on public.push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "jogador cria a própria inscrição"
  on public.push_subscriptions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "jogador troca a própria inscrição"
  on public.push_subscriptions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "jogador apaga a própria inscrição"
  on public.push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Quando o agendador rodou pela última vez: a função "tick" recusa chamadas seguidas.
-- Sem políticas: só o servidor (service role) lê e escreve.
create table public.tick_state (
  id integer primary key default 1 check (id = 1),
  last_run timestamptz not null default 'epoch'
);

alter table public.tick_state enable row level security;

insert into public.tick_state (id) values (1);

-- A cada 15 minutos o banco chama a função "tick", que avança os abrigos de quem pediu
-- avisos e manda o que houver. A função é aberta, mas inofensiva: só adianta o que o
-- relógio já faria e tem intervalo mínimo entre execuções.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'lads-remnants-tick',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://tlvymkqlpyrdubdlhohn.supabase.co/functions/v1/tick',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

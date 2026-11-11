-- Métricas mínimas de jogo: quem volta, quanto dura, como acaba.
-- Só o servidor grava (funções "game" e "tick", com service role). Sem políticas: ninguém
-- de fora lê nem escreve. Nada aqui identifica a pessoa além do id anônimo do Supabase.
create table public.play_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  day integer,
  alive integer,
  data jsonb
);

create index play_events_user_at on public.play_events (user_id, at);
create index play_events_kind_at on public.play_events (kind, at);

alter table public.play_events enable row level security;

-- Abrigo de cada jogador. O estado inteiro é um JSON da simulação (src/sim/shelter).
-- Só a Edge Function "game" (service role) escreve: ela aplica as regras do jogo.
create table public.shelters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  hour integer not null default 0,
  -- Controle otimista de concorrência: duas abas não sobrescrevem uma à outra.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shelters enable row level security;

create policy "jogador lê o próprio abrigo"
  on public.shelters for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Sem políticas de insert/update/delete: o cliente não escreve direto.

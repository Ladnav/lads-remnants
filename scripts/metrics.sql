-- Resumo das métricas de jogo (npm run metrics). Só leitura.
with firsts as (
  select user_id, min(at) as started
  from public.play_events
  where kind in ('first_session', 'session')
  group by user_id
),
returned as (
  select f.user_id,
    bool_or(e.at >= f.started + interval '20 hours' and e.at < f.started + interval '48 hours') as d1,
    bool_or(e.at >= f.started + interval '6 days') as d7
  from firsts f
  join public.play_events e on e.user_id = f.user_id and e.kind = 'session'
  group by f.user_id
)
select
  (select count(*) from firsts) as jogadores,
  (select count(*) from firsts where started > now() - interval '7 days') as novos_7_dias,
  (select count(*) from returned where d1) as voltaram_no_dia_seguinte,
  (select count(*) from returned where d7) as voltaram_depois_de_uma_semana,
  (select count(*) from public.play_events where kind = 'session' and at > now() - interval '24 hours') as sessoes_24h,
  (select count(*) from public.play_events where kind = 'raid') as incursoes,
  (select count(*) from public.play_events where kind = 'raid' and data->>'status' = 'dead') as mortes_em_incursao,
  (select count(*) from public.play_events where kind = 'game_over') as comunidades_mortas,
  (select round(avg(day), 1) from public.play_events where kind = 'game_over') as dia_medio_da_morte,
  (select count(*) from public.play_events where kind = 'evacuated') as sairam_da_cidade,
  (select count(*) from public.push_subscriptions) as aparelhos_com_avisos;

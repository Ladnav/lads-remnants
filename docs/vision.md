# Lads Remnants — Documento de Visão

> Projeto pessoal/portfólio, dev solo.

## Em uma frase
Um jogo idle de sobrevivência num apocalipse zumbi: sua comunidade vive sozinha em tempo real, e você entra poucos minutos por dia para tomar decisões difíceis. Quando quiser, conduz uma incursão tática para saquear e extrair.

## Pilares
1. **Cada sobrevivente importa.** Nome, traços, emoções, relações, perma death.
2. **2 minutos bastam, 10 minutos recompensam.** O idle se sustenta sozinho; o ativo rende mais, mas nunca é obrigatório.
3. **O mundo continua sem você.** Dias passam, pessoas sofrem, outras comunidades agem.

## Tom
Sombrio e humano, como This War of Mine. Os zumbis são o pano de fundo, a tragédia é a escolha: roubar de quem também precisa, abandonar um ferido, racionar a água das crianças.

## Loop principal
```
         ┌──────────── IDLE (automático, 12h reais = 1 dia) ────────────┐
         │  Dia: produção, crafting, consumo, emoções, visitantes        │
         │  Noite: expedições automáticas (regra de risco) + ataques     │
         └───────────────┬───────────────────────────────▲──────────────┘
                         │ relatório + dilemas            │ loot, feridos, mortes
                         ▼                                │
              SESSÃO DO JOGADOR (2–3 min)                 │
              ler relatório → decidir dilemas →           │
              enviar expedições → ajustar prioridades     │
                         │ (opcional)                      │
                         ▼                                │
              INCURSÃO ATIVA (3–8 min, tática por turnos) ┘
              explorar → saquear → extrair ou morrer
```

## Incursão ativa (Fase 1)
- Grid top-down, um turno por ação, névoa de guerra e linha de visão.
- **Ruído** atrai zumbis num raio. Andar faz pouco barulho, forçar portas e lutar fazem muito.
- **A horda cresce** com o tempo: cada turno a mais é mais loot e mais risco.
- **Mochila** com limite de peso: o que levar e o que deixar.
- **Extração**: a entrada (sempre aberta) e uma saída temporária (escada do telhado, abre e fecha em turnos definidos).
- **Perma death**: morrer significa perder o sobrevivente e tudo o que ele carrega. Ferimentos voltam para o abrigo.
- **Traços** mudam as opções: mecânico, silenciosa, forte, lutador, medroso…

## Abrigo idle (Fase 2)
- **Necessidades**: fome, sede, cansaço, saúde.
- **Emoções**: ok → triste → deprimido → quebrado. Culpa, fome e luto pioram; consolar, conforto e boas notícias melhoram. Quem está quebrado recusa tarefas, deserta ou se machuca.
- **Recursos**:
  | Recurso | Fonte | Risco |
  |---|---|---|
  | Água | Coletor de chuva, filtro, loot | Água suja causa doença |
  | Comida | Enlatados, horta, fogão | Horta consome água |
  | Suprimentos | Loot: remédio, bandagem, munição, peças, combustível | Escassos |
  | Resíduos | Gerados pelo consumo | Acumular causa doença e atrai zumbis |
  | Moral | Conforto, sucesso, rádio, álcool | Baixa causa brigas e deserção |
- **Crafting com sucata**: bancada → filtro, fogão, horta, barricadas, armas simples.
- **Visitantes na porta**: pedintes, refugiados, comerciantes, golpistas.
- **Ataques noturnos**: guarda, barricadas e armas definem as perdas.

## Social (Fase 5)
- Comunidades NPC com perfis de jogador.
- Rastros assíncronos: locais com estoque compartilhado, containers já saqueados, bilhetes.
- Corpos de sobreviventes de outros jogadores, com equipamento.
- Comércio por caravanas que viajam pelo mapa e podem ser emboscadas. Reputação.

## Fora da v1
- PvP e ataques a outras comunidades.
- Incursões em tempo real.
- Monetização.
- Arte final (usamos placeholder até a Fase 6).
- Múltiplos biomas/cidades.

## Stack
- Cliente: TypeScript + Vite + Phaser 3.
- Simulação pura e determinística em `src/sim/` (RNG por semente), compartilhável com o servidor.
- Backend (Fase 4): Supabase — Auth, Postgres, pg_cron + Edge Functions para o tick e para validar incursões (semente + log de ações).

## Glossário
- **Tick**: passo de simulação do abrigo no servidor.
- **Incursão**: missão ativa num local do mapa.
- **Expedição**: missão automática resolvida pela simulação.
- **Regra de risco**: condição de retorno de uma expedição ("volte com 70% da mochila ou se alguém se ferir").

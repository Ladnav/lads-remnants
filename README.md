# Lads Remnants

Idle de sobrevivência num apocalipse zumbi, com incursões táticas por turnos. Visão completa em [docs/vision.md](docs/vision.md).

## Rodar
```bash
npm install
npm run dev       # http://localhost:5173
npm test          # testes da simulação (Vitest)
npm run balance   # simula 45 dias de comunidades (AFK x jogador casual)
npm run build
npm run deploy:edge   # empacota src/server e publica a Edge Function "game"
npm run smoke:online  # teste ponta a ponta contra o Supabase
```

### Online x offline
Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env.local`, o jogo roda **online**: login anônimo e o servidor como autoridade. Sem essas variáveis, ou com `?offline` na URL, roda **offline** com as mesmas regras e save no navegador.

O `.env.local` (fora do git) guarda também a senha do banco e o ref do projeto (`tlvymkqlpyrdubdlhohn`, região sa-east-1).

## Estrutura
- `src/sim/`: simulação pura e determinística (sem Phaser).
  - `raid/`: incursão tática. Mapa gerado por semente, ruído, horda, mochila, combate, extração. Semente + log de ações reproduzem a partida.
  - `shelter/`: abrigo idle. Tick de 1h de jogo com necessidades, emoções, construção, expedições noturnas, visitantes na porta e ataques de madrugada.
- `src/data/`: itens, recursos, receitas, locais, traços e sobreviventes.
- `src/game/`: cenas Phaser (abrigo, mapa da região e incursão), HUDs e save local.
- `src/server/game.ts`: regras de servidor (comandos, ingressos de incursão, reprodução do log de ações). Rodam no navegador (offline) e na Edge Function (online).
- `src/net/`: backends local e Supabase.
- `supabase/`: migração (tabela `shelters` com RLS só de leitura), Edge Function `game` e config de auth.
- `src/main.ts`: relógio em tempo real, troca abrigo ↔ incursão, relatório "enquanto você esteve fora".
- `scripts/balance.ts`: balanceamento automático.

## Status
- **Fase 1**: incursão tática jogável.
- **Fase 2**: abrigo idle jogável, com save no navegador. 1 dia de jogo = 12h reais; os botões 60×/600×/+1h/+6h servem para testar.
- **Fase 3**: integração completa.
  - Mapa da região com 5 locais. Só 2 são conhecidos no início; os outros são revelados por 🗺️ mapas rabiscados, achados apenas em incursões ativas.
  - Incursão ativa em qualquer local conhecido, com loot e quantidade de zumbis próprios.
  - Emergências: uma expedição noturna pode ficar encurralada. O jogador assume o controle (incursão em modo emergência, com a horda já acordada) ou deixa com a IA.
  - Relatório de retorno com o saldo de recursos, quem morreu ou partiu e quem chegou.
- **Visual 3/4** no abrigo, no mapa e na incursão (câmera seguindo o sobrevivente).
- **Fase 4**: backend no Supabase.
  - Login anônimo, com opção de vincular e-mail depois.
  - O servidor é a autoridade: o cliente só manda comandos e a tabela é só leitura para o jogador.
  - A simulação avança de forma preguiçosa a cada acesso (determinística, sem cron).
  - Incursões com ingresso: a semente vem do servidor e o loot sai da reprodução do log de ações. Fechar a aba no meio conta como fuga ferida.
  - `ALLOW_DEV_TOOLS=true` (secret da função) libera +1h/+6h. **Desligue antes de playtests com outras pessoas.**
  - Fica para a Fase 4b: push notifications (PWA) e o cron do tick.

- **Revisão de mecânicas**:
  - Incursão ativa: uma por dia por sobrevivente, recusada com cansaço alto, e o loot do mapa segue o estoque do local. Um mapa rabiscado por local.
  - Equipamento: dá para levar arma e até 2 bandagens do estoque. Voltam se o sobrevivente voltar.
  - Combate: três tipos de zumbi (comum, corredor, brutamontes) e 2 pedras por incursão para distrair (T).
  - Ordens permanentes: repetir uma expedição toda noite e fila de construção.
  - Modo de espera: após 24h reais sem comando, o grupo consome menos e ninguém bate na porta.
  - Emergência: o encurralado aguenta 12h reais além da volta do grupo.

- **Visual**: personagens em pixel art gerados por código (`src/game/sprites.ts`), com animação de andar. No abrigo seguem caminhos pelas portas; no mapa, o grupo anda pela rota. Galeria em `?sprites`.
- **Relações**: cada par de sobreviventes tem um laço que cresce com trabalho lado a lado, jantar na mesa e expedições juntos, e azeda com fome e mau humor. Amigos (💛) rendem mais na mesma tarefa, se protegem em expedição, seguram o humor e a deserção, e sofrem mais com a morte um do outro. Desafetos (⚡) fazem o contrário.
- **Objetivo**: sair da cidade. Construir o rádio, decifrar a transmissão (36h de escuta noturna, sozinho) e juntar 6 de combustível mais comida e água para a estrada. Partir encerra a história com quem estiver vivo.

Balanceamento atual (`npm run balance`, 40 sementes, até 45 dias): sem nenhuma visita, a comunidade dura cerca de 7 dias de jogo. Com uma única visita deixando ordens permanentes, cerca de 17 dias (8 dias reais). Um jogador casual simulado (2 visitas por dia, duas expedições por noite, sem incursões ativas) dura cerca de 29 dias, e só 1 em 40 consegue partir: sem incursões ativas faltam peças para o rádio.

Controles da incursão: setas/WASD movem. Andar até uma porta abre, andar até um zumbi ataca. E procura, Espaço espera, X extrai, P/F abrem ou forçam portas trancadas, B faz curativo.

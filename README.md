# Lads Remnants

Idle de sobrevivência num apocalipse zumbi, com incursões táticas por turnos. Visão completa em [docs/vision.md](docs/vision.md).

## Rodar
```bash
npm install
npm run dev       # http://localhost:5173
npm test          # testes da simulação (Vitest)
npm run balance   # simula 30 dias de comunidades (AFK x jogador casual)
npm run build
```

## Estrutura
- `src/sim/`: simulação pura e determinística (sem Phaser).
  - `raid/`: incursão tática. Mapa gerado por semente, ruído, horda, mochila, combate, extração. Semente + log de ações reproduzem a partida.
  - `shelter/`: abrigo idle. Tick de 1h de jogo com necessidades, emoções, construção, expedições noturnas, visitantes na porta e ataques de madrugada.
- `src/data/`: itens, recursos, receitas, locais, traços e sobreviventes.
- `src/game/`: cenas Phaser (abrigo, mapa da região e incursão), HUDs e save local.
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

Balanceamento atual (`npm run balance`, 40 sementes): sem nenhuma visita, a comunidade dura cerca de 6 dias. Um jogador casual simulado (2 visitas por dia) dura cerca de 23 dias, e 30% chegam ao dia 30.

Controles da incursão: setas/WASD movem. Andar até uma porta abre, andar até um zumbi ataca. E procura, Espaço espera, X extrai, P/F abrem ou forçam portas trancadas, B faz curativo.

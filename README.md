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
- `src/game/`: cenas Phaser (abrigo e incursão), HUDs e save local.
- `src/main.ts`: relógio em tempo real, troca abrigo ↔ incursão, relatório "enquanto você esteve fora".
- `scripts/balance.ts`: balanceamento automático.

## Status
- **Fase 1**: incursão tática jogável.
- **Fase 2**: abrigo idle jogável, com save no navegador. 1 dia de jogo = 12h reais; os botões 60×/600×/+1h/+6h servem para testar.
- **Fase 3 (parcial)**: a incursão sai do abrigo, e o loot, os ferimentos e as mortes voltam para ele.

Balanceamento atual (`npm run balance`, 40 sementes): sem nenhuma visita, a comunidade dura cerca de 6 dias. Um jogador casual simulado (2 visitas por dia) dura cerca de 23 dias, e 30% chegam ao dia 30.

Controles da incursão: setas/WASD movem. Andar até uma porta abre, andar até um zumbi ataca. E procura, Espaço espera, X extrai, P/F abrem ou forçam portas trancadas, B faz curativo.

# Lads Remnants

Idle de sobrevivência num apocalipse zumbi, com incursões táticas por turnos. Visão completa em [docs/vision.md](docs/vision.md).

## Rodar
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes da simulação (Vitest)
npm run build
```

## Estrutura
- `src/sim/`: simulação pura e determinística (sem Phaser). A mesma semente + o mesmo log de ações reproduzem a partida.
  - `raid/mapgen.ts`: gera o mercado (salas BSP, portas, containers, zumbis, saídas).
  - `raid/raid.ts`: regras da incursão (ruído, horda, mochila, combate, extração).
- `src/data/`: itens, containers, traços e sobreviventes.
- `src/game/RaidScene.ts`: desenho em Phaser (só lê o estado).
- `src/main.ts`: controles, HUD e telas de início e fim.

## Status
Fase 1: protótipo da incursão ativa jogável.

Controles: setas/WASD movem. Andar até uma porta abre, andar até um zumbi ataca. E procura, Espaço espera, X extrai, P/F abrem ou forçam portas trancadas, B faz curativo.

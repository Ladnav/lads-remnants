# Roteiro: próximos passos

Lista em ordem. Quem continuar o trabalho (uma pessoa ou uma sessão agendada) pega o
primeiro item sem marca, faz, confere, commita e marca aqui com `[x]`.

## Regras para trabalho sem supervisão
- Um item por sessão. Terminou, parou.
- Antes de commitar: `npx tsc --noEmit`, `npm test` e `npm run build` precisam passar.
- Commit local na `main`, mensagem em português. Nunca `git push`, nunca publicar.
- Não rodar `npm run art` com geração (gasta créditos do Gemini) nem `npm run deploy:edge`.
- Não mexer em `.env.local`.
- Direção de arte: manter o estilo do jogo (cenário desenhado por código, traço simples,
  tom sombrio). Arte pintada só em retratos, ilustrações e telas de menu, e só a que já existe
  em `public/art/`. Nada de cenário elaborado ou 3D.
- Se um item depender de decisão do dono do projeto, não adivinhar: anotar a dúvida no item
  e passar para o próximo.

## Visual e usabilidade (podem ser feitos sem supervisão)
- [x] **Ícones próprios no painel.** Trocar os emojis de recursos (`RESOURCES` em
  `src/data/shelter.ts`, usados em `src/game/shelterUi.ts`), das abas e dos locais por ícones
  de pixel art gerados por código (mesma ideia de `src/game/sprites.ts`: grade pequena,
  contorno escuro, exportados como data URL). Emojis mudam de cara em cada aparelho.
- [x] **Balões de status no abrigo.** Os balões acima das cabeças (`statusIcon` em
  `src/game/ShelterScene.ts`) ainda são emojis; trocar pelos ícones do item anterior.
- [x] **Mapa da região no nível do abrigo.** Em `src/game/RegionScene.ts`: sombra na base dos
  prédios, variação nas ruas e quadras, noite com focos de luz usando `src/game/night.ts`,
  chuva quando `s.raining`.
- [ ] **Incursão no nível do abrigo.** Em `src/game/RaidScene.ts`: variação do piso por tile,
  sombra na base das paredes, luz ao redor do sobrevivente no lugar da névoa chapada.
- [ ] **Tela do grupo.** Uma visão geral dos personagens: grade de retratos grandes com nome,
  estado e tarefa, abrindo a ficha (`showProfile` em `src/main.ts`) ao clicar. Incluir mortos
  e quem partiu, em tom apagado.
- [ ] **Câmera no celular.** Em tela estreita o abrigo e o mapa encolhem demais. Aproximar a
  câmera e permitir arrastar, como a incursão já faz seguindo o personagem.
- [ ] **Som.** Ambiente (chuva, vento, noite) e efeitos curtos (porta, golpe, aviso), gerados
  por WebAudio, sem baixar arquivos. Com botão de mudo que fica salvo no navegador.
- [ ] **README e capturas.** Atualizar `README.md` com a repaginação, a ficha, `npm run art` e
  o registro de custo; refazer as capturas antigas em `docs/screenshots/`.

## Dependem do dono do projeto (não fazer sem ele)
- [ ] **Publicação e PWA.** Escolher hospedagem, criar repositório remoto, desligar
  `ALLOW_DEV_TOOLS` no servidor.
- [ ] **Notificações (Fase 4b).**
- [ ] **Ajuste da dificuldade do objetivo**, depois de uma semana de jogo real.
- [ ] **Social (Fase 5):** rastros, corpos e comércio.
- [ ] **Mais arte gerada.** O gasto estimado está em `art/ledger.json`; o teto é
  `ART_BUDGET_USD` no `.env.local`.

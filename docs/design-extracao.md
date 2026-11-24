# Design: extração com base (saque, equipamento, chaves e invasões)

> Status: **rascunho para aprovação**. Nada disto está implementado além do cofre com chave, da janela
> estreita e do andar contínuo da incursão.

## 1. A ideia em uma frase

Você sai para saquear prédios perigosos e volta com equipamento cada vez melhor. Guarda tudo num abrigo
que outros querem roubar, e decide o que arriscar levando e o que deixar escondido.

### Pilares (não mudam)
1. **Cada sobrevivente importa.** Quem morre fica morto e deixa o corpo e o equipamento para trás.
2. **2 minutos bastam, 10 minutos recompensam.** O abrigo se defende sozinho, e jogar a incursão rende mais.
3. **O mundo continua sem você.** De noite tentam entrar, mesmo com o jogo fechado.
4. **Novo: funciona sem internet.** Tudo o que é contra o computador roda no aparelho. A internet só soma
   o que envolve outras pessoas.

### O ciclo
```
 escolher equipamento ─► incursão (saquear, achar chaves, extrair ou morrer)
          ▲                                   │
          │                                   ▼
  fabricar / consertar ◄─ abrigo: depósito exposto + esconderijo + arsenal
          ▲                                   │
          │                                   ▼
   revidar / invadir  ◄──  invasão noturna (levam parte do que está exposto)
```

---

## 2. Offline primeiro

### Como é hoje
- Todas as regras já rodam no aparelho: `src/sim` e `src/server/game.ts` são o mesmo código no navegador
  e no servidor.
- Há **dois saves separados**: o offline (localStorage) e o online (Supabase). Quem joga sem internet
  não leva o progresso para a conta.

### Como fica: um save só, que sincroniza
O aparelho guarda **o estado** e uma **fila de comandos**, em que cada comando leva a hora real em que
foi feito.

- **Sem internet:** o jogo aplica o comando na hora, pelas mesmas regras de hoje, e ele entra na fila.
  Dá para jogar dias assim.
- **Com internet:** o aparelho envia a fila. O servidor parte do último estado que confirmou, refaz os
  comandos em ordem e devolve o estado oficial. Se bater com o do aparelho (o normal), nada muda na tela.
- **Se não bater** (save adulterado, versão velha do jogo): vale o do servidor, e o jogador vê um aviso
  de que o progresso foi corrigido pelo servidor.
- **Sem conta ou sem servidor configurado:** o jogo funciona 100% local para sempre, como o `?offline`
  de hoje. Só ficam de fora o ranking e as invasões entre jogadores.

### As três brechas e como fechar
| Brecha | Regra |
|---|---|
| Adiantar o relógio do aparelho para o tempo passar mais rápido | O servidor nunca aceita mais tempo de jogo do que o tempo real que passou desde a última sincronização. Comando com hora no futuro ou fora de ordem é recusado. |
| Refazer uma incursão até sair boa (fechar o jogo e tentar de novo) | **Talão de sementes:** a cada sincronização o servidor entrega as próximas 10 sementes de incursão, já registradas. A incursão offline usa a próxima da lista. Abandonar consome a semente e conta como fuga, como hoje. Acabaram as 10: só com internet. |
| Inventar loot | O loot nunca é enviado. O servidor refaz a incursão a partir da semente e dos passos, como já faz hoje. |

### O que funciona sem internet
| Recurso | Offline | Observação |
|---|---|---|
| Abrigo, construção, visitas, expedições automáticas | ✔ | igual a hoje |
| Incursão ativa, saque, chaves, equipamento | ✔ | usa o talão de sementes |
| Invasões do computador contra você | ✔ | acontecem na simulação, inclusive no "enquanto você estava fora" |
| Você invadir comunidades do computador | ✔ | |
| Invadir abrigo de outro jogador | ✔ com foto baixada | a foto do abrigo alvo é baixada quando há internet; o resultado entra na fila |
| Ser invadido por outro jogador | quando sincronizar | o servidor aplica a invasão na hora certa da história |
| Ranking, temporada, notificações | ✘ | precisam do servidor |

---

## 3. Saque

### 3.1 Tipos de item
Cada item passa a ter um **tipo** e uma **raridade**:

- **Recurso:** o que existe hoje (enlatado, água, sucata…). Vira estoque do abrigo ao voltar.
- **Equipamento:** arma, mochila, proteção, utilitário. Fica como item, com desgaste, no arsenal.
- **Chave:** abre uma sala ou um local. Tem número de usos.
- **Material raro:** usado para fabricar o incomum e melhorar o esconderijo (molas, circuito, tecido
  balístico, ferramentas de precisão).
- **Pista:** o mapa rabiscado de hoje, e bilhetes que apontam salas especiais.

### 3.2 Raridade
| Raridade | Cor | Exemplo |
|---|---|---|
| Comum | cinza | enlatado, sucata, faca improvisada |
| Incomum | verde | remédio, taco com pregos, mochila de trilha |
| Raro | azul | revólver, colete, kit de gazua, chave do almoxarifado |
| Lendário | dourado | espingarda, mochila militar, cartão do bunker |

O item brilha na cor dele no móvel, na mochila e no relatório de volta.

### 3.3 Onde cada coisa sai: nível do móvel × perigo do local
| Nível do móvel | Exemplos | Comum | Incomum | Raro | Lendário |
|---|---|---|---|---|---|
| N1 | prateleira, balcão | 80% | 18% | 2% | 0% |
| N2 | armário, caixa de ferramentas, mesa do escritório | 55% | 35% | 9% | 1% |
| N3 | cofre do local, sala especial | 20% | 45% | 30% | 5% |
| N4 | local secreto | 0% | 30% | 50% | 20% |

- Local de perigo 2 desloca 5 pontos de comum para raro; perigo 3 desloca 10.
- Local muito saqueado (estoque baixo) tem menos itens, mas **não** pior raridade: o que sobrou é o que
  ninguém achou.
- Cada local tem a **sua lista** por raridade (farmácia: remédios; delegacia: armas e munição; oficina:
  ferramentas e peças).

---

## 4. Equipamento

### 4.1 Espaços
O sobrevivente leva **1 arma, 1 mochila, 1 proteção e 1 utilitário**. Tudo vai junto e **se perde se ele
morrer**. O que estava no corpo fica caído no local (ver 4.4).

### 4.2 Armas (números iniciais, para ajustar nos testes)
| Arma | Raridade | Dano | Acerto | Barulho do golpe | Desgaste | Especial |
|---|---|---|---|---|---|---|
| Mãos | — | 1 | 60% | 4 | ∞ | |
| Faca improvisada | comum | 1 | 75% | 2 | 12 golpes | silenciosa |
| Taco com pregos | incomum | 2 | 70% | 4 | 15 | |
| Pé de cabra | incomum | 2 | 70% | 4 | 20 | arromba portas e cofres |
| Facão | raro | 3 | 75% | 3 | 18 | |
| Revólver | raro | 3 | 85% a até 4 casas | **10** | 30 tiros | gasta 1 munição por tiro |
| Espingarda | lendário | 4 em leque | 90% a até 3 casas | **14** | 20 | gasta 2 munições por tiro |

- Armas de fogo atacam de longe, com o mesmo modo de mira da pedra. O barulho chama a horda e adianta
  a próxima leva.
- **Desgaste:** cada golpe gasta 1. Com 0, a arma quebra e o sobrevivente passa a lutar com as mãos.
  A bancada conserta gastando peças.

### 4.3 Mochila, proteção e utilitário
| Item | Raridade | Efeito |
|---|---|---|
| Mochila escolar | comum | 10 kg (hoje é o padrão) |
| Mochila de trilha | incomum | 14 kg |
| Mochila militar | lendário | 18 kg |
| Jaqueta de couro | incomum | mordida −20% |
| Colete | raro | mordida −40%, +1 kg no peso |
| Lanterna | incomum | enxerga 2 casas mais longe |
| Kit de gazua | raro | fechaduras em 1 turno, cofres sem chave em 3 turnos e quieto |
| Tênis macio | incomum | passo silencioso, como o traço Silencioso |
| Rádio de pilha | raro | mostra onde a próxima leva da horda vai entrar |

O traço Forte continua dando +4 kg em cima de qualquer mochila.

### 4.4 Morte e o corpo
- Morreu na incursão: o corpo fica no local com **todo o equipamento e a mochila**.
- Na próxima incursão ao **mesmo local**, nos próximos 3 dias de jogo, o corpo aparece no mapa e dá para
  recuperar tudo, se chegar até ele. Depois disso, alguém levou.
- Isso funciona offline, porque o corpo é guardado no estado do abrigo e entra na geração do mapa.

### 4.5 Antes de entrar
A tela de incursão ganha os **4 espaços** para escolher do arsenal, no lugar do "levar arma" e das
bandagens de hoje. Ela mostra o valor total em risco ("você vai arriscar: 1 raro, 2 incomuns").

---

## 5. Chaves e lugares trancados

### 5.1 Chave de dentro (já existe)
O cofre de cada local abre com a chave achada no mesmo prédio. Só vale dentro daquela incursão.

### 5.2 Chaves que ficam com você
Saem como **raro** de móveis N2 e N3 de **outro** local e abrem uma **sala especial** fixa:

| Chave | Onde costuma sair | O que abre | Usos |
|---|---|---|---|
| Chave da sala do gerente | Oficina, Farmácia | sala no Mercado (comida e remédios N3) | 3 |
| Chave do depósito da oficina | Mercado | sala na Oficina (ferramentas, peças, armas brancas) | 3 |
| Cartão do almoxarifado | Farmácia, Delegacia | sala no Hospital (remédios, colete, material raro) | 2 |
| Chave do arsenal | Hospital | sala na Delegacia (revólver, munição, colete) | 2 |
| Cartão da Defesa Civil | sala do Hospital ou da Delegacia (lendário) | **local secreto: Bunker** | 1 |
| Combinação da casa-forte | bilhete no Bunker | **local secreto: Banco** | 1 |

- A sala especial é um cômodo com porta reforçada que só abre com a chave. Pé de cabra não abre, e o kit
  de gazua abre em 6 turnos, com barulho médio.
- As chaves ficam no arsenal e **podem ser roubadas numa invasão** se não estiverem no esconderijo.

### 5.3 Locais secretos
Aparecem no mapa da região só depois de achar o acesso. Têm perigo 4, um mapa maior, mais corredores e
brutamontes, e móveis N4 com chance de lendário. A entrada gasta a chave, então é uma tentativa por
chave.

---

## 6. A base

### 6.1 Onde as coisas ficam
- **Depósito (exposto):** recursos e materiais. É dele que uma invasão rouba.
- **Arsenal (exposto):** equipamento e chaves que não estão com ninguém.
- **Esconderijo (protegido):** nunca é roubado. É construído e melhorado na bancada:

| Nível | Custo | Protege |
|---|---|---|
| 1 | 4 madeira, 2 sucata | 20% de cada recurso + 2 espaços de equipamento ou chave |
| 2 | 4 peças, 2 molas (raro) | 35% + 5 espaços |
| 3 | 3 componentes, 2 ferramentas de precisão (raro) | 50% + 10 espaços |

O jogador escolhe quais itens vão para os espaços do esconderijo. Os recursos são protegidos
automaticamente pela porcentagem.

### 6.2 Defesas (bancada)
| Defesa | Custo | Efeito na invasão |
|---|---|---|
| Barricada (existe, até 3) | 4 madeira, 2 sucata | porta da frente leva mais golpes para ceder |
| Armadilha de latas (até 4) | 2 sucata | casa que faz barulho quando pisada: acorda quem dorme |
| Estacas (até 4) | 3 madeira | casa que fere quem passa (−1 de vida) |
| Porta reforçada (1) | 3 sucata, 2 peças | o depósito vira uma sala trancada |
| Torre de vigia (1) | 5 madeira, 2 sucata | quem vigia enxerga o invasor chegando: +1 turno de aviso |

O jogador escolhe onde ficam as armadilhas num quadriculado simples do abrigo.

---

## 7. Invasões contra você

### 7.1 Quando
- O sorteio noturno de hoje continua, influenciado por resíduos, barricada e ameaça de saqueadores.
- **Rancor:** comunidades que você invadiu têm mais chance de vir.
- Uma por noite no máximo.

### 7.2 Como é resolvida
A invasão **usa o mesmo motor da incursão**, com os papéis invertidos:

- **Mapa:** a planta real do abrigo (a mesma do desenho), com portas, barricadas, armadilhas e o depósito.
- **Invasor:** um saqueador controlado pelo computador. Ele entra por uma janela ou pela porta, segue até
  o depósito, enche a mochila, que tem teto de 25% do que está exposto, e tenta sair. Foge se ficar ferido.
- **Defensores:** quem está de guarda age como os zumbis da incursão. Para o invasor, eles são inimigos
  que veem, ouvem e atacam.
- **Quem dorme:** acorda com barulho (latas, briga) e passa a defender também, mas mais fraco.
- O resultado sai da simulação: o que foi levado, quem se feriu e se o invasor morreu. Se ele morreu,
  deixa o corpo e o equipamento no abrigo.

Tudo é determinístico, com semente e registro de passos, então roda offline no "enquanto você estava
fora" e o servidor confere igual.

### 7.3 Assistir e reagir
- **Assistir:** o relatório da manhã tem o botão "Ver a invasão", que mostra o replay na tela da incursão.
  É o melhor momento para tirar print.
- **Assumir a defesa (fase posterior):** se o aviso chegar com o jogo aberto, você controla um defensor.
  Fica para depois porque exige o motor com dois lados controláveis.

---

## 8. Você invade (comunidades do computador)

- Duas comunidades no mapa da região:
  - **Saqueadores do Viaduto:** armados, com muito estoque, agressivos e com mais rancor.
  - **Seita da Capela:** pouca arma, muita comida e remédio, armadilhas.
- **A incursão** usa um mapa gerado a partir da semente com a planta de um abrigo: cômodos, depósito,
  esconderijo deles com móvel N3, guardas humanos (o novo tipo de inimigo) e armadilhas.
- **Guardas humanos:** enxergam mais longe que zumbis e não são atraídos por barulho da mesma forma, porque
  vão investigar e voltar ao posto. Atacam com arma, e alguns têm arma de fogo. Ao morrer, deixam o
  equipamento.
- **Rancor (0 a 100):** sobe a cada invasão e a cada guarda morto, e aumenta a chance e a força das
  invasões contra você. Cai com o tempo, ou na hora com um **acordo**: um visitante da comunidade oferece
  trégua em troca de recursos.
- **Saque de comunidade:** sempre tem chance boa de equipamento, porque é gente armada.

---

## 9. Jogadores reais (precisa de servidor)

- **Foto do abrigo:** quando o jogador sincroniza, o servidor guarda uma foto com a planta, as defesas,
  quem vigia, o depósito e o arsenal expostos.
- **Achar alvo:** o servidor oferece 3 fotos de força parecida, medida por dia de jogo, construções e
  equipamento. Ela fica baixada e dá para invadir offline. O resultado entra na fila.
- **Proteções:**
  - quem tem menos de 7 dias de jogo não é alvo;
  - quem foi invadido ganha 24 h de escudo;
  - 1 invasão por dia por jogador;
  - teto de 25% do exposto;
  - o mesmo alvo só uma vez a cada 3 dias.
- **A vítima:** recebe o aviso ("Alguém da comunidade *Fulano* entrou de madrugada e levou…"), vê o replay
  e ganha um **revide** com a foto do abrigo do invasor, que fica disponível por 2 dias.
- **Corpos:** o invasor que morre deixa equipamento no abrigo da vítima.
- **Conferência:** o servidor refaz a invasão a partir da foto (que ele mesmo guardou), da semente e dos
  passos, igual às incursões.

## 10. Temporadas (só com gente suficiente)
- 4 semanas numa cidade compartilhada, com ranking de quem durou mais, saqueou mais e se defendeu melhor.
- No fim vem a "grande horda" e todos recomeçam.
- Passa para a próxima temporada só algo cosmético: um título e a cor do abrigo no mapa.

---

## 11. Telas novas ou mudadas
1. **Arsenal:** itens com raridade, desgaste, consertar, mandar para o esconderijo.
2. **Antes da incursão:** os 4 espaços e o valor em risco.
3. **Incursão:** brilho de raridade, desgaste da arma, mira da arma de fogo, sala especial, corpo caído.
4. **Volta da incursão:** saque organizado por raridade, com destaque para o melhor item.
5. **Defesas:** quadriculado do abrigo para posicionar armadilhas.
6. **Relatório da manhã:** cartão da invasão com "Ver a invasão".
7. **Mapa da região:** comunidades, rancor, locais secretos.

## 12. Dados e saves antigos
- `ItemDef` ganha `kind`, `rarity` e, conforme o tipo, `slot`, `stats`, `durability` e `uses`.
- O estado ganha `armory` (equipamento com desgaste), `stash` (esconderijo), `keys`, `defenses`,
  `traps`, `bodies` (corpos por local e prazo), `factions` (estoque e rancor), `seedBook` (talão de
  sementes) e `syncedAt`.
- **Migração:** cada arma do recurso `weapons` vira uma faca improvisada no arsenal; o resto vira o padrão
  vazio. A versão do save passa para 2, e saves antigos continuam abrindo.

## 13. Arte
- Ícones de item: desenhados por código, como os de hoje. Não custa nada.
- **Precisa de imagem:**
  - o saqueador humano, de frente e de costas;
  - o guarda da Seita;
  - a porta reforçada e as armadilhas, que podem ser desenhadas por código.
- Cerca de 4 imagens, uns US$ 0,60. Sobram uns US$ 0,68 até o teto de US$ 10.

---

## 14. Ordem de implementação
Cada fase termina jogável, testada e publicável.

| Fase | Conteúdo | Pronto quando |
|---|---|---|
| **0a** ✅ | Tipos de item, raridade, tabelas N1 a N4, brilho; migração do save (feito em 2026-11-24; sem migração: os ids de item não mudaram) | Testes de tabela (distribuição dentro do esperado em 10 mil sorteios); saves antigos abrem |
| **0b** ✅ | Equipamento: 4 espaços, armas com desgaste, arma de fogo com mira, arsenal, tela antes da incursão (feito em 2026-11-24; rádio de pilha ficou de fora) | Uma incursão com revólver e outra só com faca mostram a diferença de barulho e risco |
| **0c** | Chaves persistentes, salas especiais, corpo recuperável | Chave achada no Mercado abre a sala da Oficina na incursão seguinte |
| **1a** | Um save que sincroniza: fila de comandos, talão de sementes, conferência no servidor | Jogar 1 dia offline, reconectar, e o servidor aceitar; relógio adiantado é recusado |
| **1b** | Esconderijo, depósito exposto, defesas, saqueador humano | Testes das regras de proteção e teto de 25% |
| **1c** | Invasão simulada no motor da incursão, replay "Ver a invasão" | Replay mostra exatamente o que o relatório diz |
| **2** | Comunidades do computador, guardas humanos, rancor, acordo | Invadir os Saqueadores do Viaduto e receber o revide nas noites seguintes |
| **3** | Fotos de abrigo, alvos de jogadores, proteções, revide | Dois aparelhos se invadindo, com escudo e teto funcionando |
| **4** | Temporadas e ranking | Quando houver jogadores |

A fase 1a pode ir antes da 0, se jogar sem internet com o mesmo save for prioridade. Ela não depende de
saque nem de equipamento.

## 15. Decisões que dependem de você
1. **Ordem:** começar pelo saque (0a a 0c) ou pelo save único offline (1a)?
2. **Morte do invasor de verdade:** numa invasão entre jogadores, o sobrevivente do invasor pode morrer
   de vez no abrigo da vítima? Proposta: sim, é o risco que equilibra o ataque.
3. **Arma de fogo:** deixar já na fase 0b, ou guardar para a fase 2 (com os guardas humanos)?
4. **Orçamento de arte:** subir o teto para mais US$ 2 ou US$ 3 para os personagens novos?

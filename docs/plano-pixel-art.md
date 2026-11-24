# Plano: remapear o jogo para pixel art

> Status: **para aprovação**. As imagens de comparação estão em `docs/pixel/`. Os conceitos foram
> gerados pelo Gemini só para mostrar o estilo e não entram no jogo como estão.

## 1. O que muda, lado a lado

| | Hoje (pintado) | Pixel art 16-bit |
|---|---|---|
| Aparência | pintura realista, carvão e pincel seco | pixels nítidos, contorno escuro, paleta limitada de cerca de 32 cores |
| Personagens | 2 imagens paradas (frente e costas) que balançam | **4 direções, passos de verdade** (4 quadros), sentar, dormir, trabalhar |
| Cenário | 1 pintura grande por cena; móveis pintados à parte, em ângulo diferente | **peças de 32×32** (piso, parede, porta) e móveis desenhados no mesmo ângulo |
| Conteúdo novo (itens, armas, inimigos, salas) | cada coisa nova é uma pintura que precisa combinar com as outras | uma peça pequena; fácil de manter coerente, dá até para desenhar por código |
| Luz | gradiente suave | luz em degraus com pontilhado: fica mais "pixel" e mais sombrio |
| Desempenho no celular | pesado: tela desenhada em 3× e imagens grandes | leve: resolução baixa ampliada em número inteiro |
| Tamanho do download | ~4 MB de imagens | menos de 1 MB |
| Texto e interface | fonte comum | fonte pixel nos títulos e números, molduras pixel; texto longo continua legível |

### O que se ganha
- **Animação.** O ponto fraco de hoje: os pintados não andam de verdade. Em pixel art, 4 quadros por
  direção é o normal.
- **Coerência para crescer.** O design de extração pede dezenas de itens, armas, armaduras, salas,
  comunidades e um inimigo humano. Em pixel art cada coisa é pequena e segue a mesma paleta. Em pintura,
  cada imagem nova é uma aposta.
- **Celular mais leve** e um jogo com cara de "jogo", mais próximo dos idle e extraction de sucesso
  no celular.

### O que se perde
- O clima de pintura realista, que é bonito nas telas grandes (mapa, fichas e cenas de final).
- As imagens pintadas já feitas (cerca de US$ 8,70 de Gemini). Dá para **manter algumas** como
  ilustração em telas estáticas (ficha do personagem, cena de final, cartão de local), como livro
  ilustrado: o jogo em pixel e as "fotos" pintadas no menu. Proposta abaixo.

## 2. Decisões de estilo propostas

- **Grade (decidida na prova de estilo):** peças de 32×32 pixels e personagem de cerca de 30×72, na
  resolução original das folhas geradas. Com 16 px a redução apagava o rosto e os detalhes e a imagem ficava borrada.
- **Nitidez:** o canvas usa pixels físicos da tela com ampliação inteira (2×, 3×), descontando a densidade do aparelho.
- **Câmera:** a mesma de hoje (de cima, levemente inclinada, paredes com face frontal). As regras e os
  mapas não mudam.
- **Resolução interna:** a cena é desenhada em baixa resolução (por exemplo 320 a 480 px de largura) e
  ampliada em número inteiro (3×, 4×). Phaser com `pixelArt: true`; saem o `RES = 3` e o `TILE = 28`
  (vira 16).
- **Paleta fixa:** 32 cores, frias e dessaturadas, com acentos quentes de fogo e vela. Tudo, inclusive o
  que for gerado por IA, é forçado a essa paleta. É o que segura a coerência.
- **Contorno:** 1 pixel escuro em personagens e objetos; o cenário fica sem contorno, para separar fundo
  e frente.
- **Luz:** a escuridão continua, mas a borda da luz vira 3 ou 4 degraus com pontilhado, sem degradê liso.
- **Ícones:** os de hoje já são pixel art, 10×10 desenhados por código. Passam para 16×16, com mais
  detalhe e cor de raridade.
- **Retratos:** 48×48 em pixel art para a ficha e a lista do grupo. Opcional: manter os pintados só na
  ficha grande.

### Regras para os móveis não "voarem" (aprendidas na prova)
1. **Mesmo ângulo do chão:** pedir sempre "de frente, visto de cima, sem diagonal e sem isométrico".
   Frente reta, paralela à borda de baixo, e o tampo visto de cima logo acima dela. Na diagonal, nada
   assenta.
2. **Sombra pela área ocupada, não elipse:** calculada da própria imagem, com a largura da base e a
   profundidade do tampo, deslocada 2 px para a direita e 1 para baixo. Fica atrás do móvel e aparece
   entre as pernas, embaixo da mesa e na borda.
3. **Encostar nas paredes:** cabeceira, fogão, prateleira e bancada contra a parede de cima, com a parte
   de trás cobrindo a face da parede. Nada no meio do caminho nem na frente das portas.
4. **Escala por objeto:** o Gemini desenha tudo do mesmo tamanho; cada móvel volta à altura certa perto
   de uma pessoa de 72 px (o balde tem 26, a cama 83).

## 3. De onde vem a arte

O conceito do Gemini **imita** pixel art: o tamanho do pixel varia e as cores não são exatas. Para usar
no jogo há três caminhos, e o plano combina os três:

| Caminho | Bom para | Custo | Problema |
|---|---|---|---|
| **A. IA + "encaixe na grade"** (gera, mede o pixel da imagem, reduz exatamente nessa grade e limita as cores) | móveis, pisos, paredes, mapa da região, retratos | Gemini, cerca de US$ 0,14 por imagem | às vezes pede retoque manual |
| **B. PixelLab** (IA feita para pixel art; você tem chave) | **personagens em 4 direções com passos**, inimigos | plano deles; ver créditos | precisa testar a qualidade e o preço |
| **C. Desenho por código** (como os ícones e os bonecos antigos) | ícones, armadilhas, portas, efeitos, peças simples | zero | trabalhoso para coisas orgânicas |

Alternativa paga e rápida: **pacotes de pixel art comerciais** com licença (há pacotes de interiores e
cidade moderna muito bons). O jogo fica pronto antes, mas com cara de outros jogos que usam o mesmo
pacote. Não recomendo como base, só para tapar buraco.

## 4. Ordem do trabalho

Cada passo termina jogável. O jogo continua publicável no meio, porque a troca é por cena.

| Passo | O quê | Arte | Pronto quando |
|---|---|---|---|
| **P0. Prova de estilo** | paleta de 32 cores; 1 personagem (Marta) em 4 direções com passos; 6 peças de piso e parede; 3 móveis; fonte pixel. Tudo montado numa cena de teste | B + A + C | você aprova o visual no celular |
| **P1. Motor** | `pixelArt: true`, grade de 32, ampliação inteira em pixels físicos, câmera e toque recalibrados, luz em degraus | — | as três cenas rodam com arte provisória sem quebrar regras nem testes |
| **P2. Personagens** | 8 sobreviventes + 3 zumbis: 4 direções, andar, parado, sentar, dormir, trabalhar | B (ou C para o básico) | o abrigo e a incursão mostram gente andando de verdade |
| **P3. Abrigo** | piso e parede em peças, os 10 móveis, horta, chuva, noite | A + C | abrigo inteiro em pixel, de dia, à noite e com chuva |
| **P4. Incursão** | peças dos 5 locais, móveis por local, cofre, janela, saídas | A + C | uma incursão em cada local |
| **P5. Mapa da região** | cidade em pixel com os marcadores | A (1 imagem grande encaixada) | mapa noturno com lanternas |
| **P6. Interface** | molduras, botões, ícones 16×16, retratos 48×48, fonte | A + C | todas as abas sem nada "pintado" fora do lugar |
| **P7. Limpeza** | decidir o que dos pintados fica como ilustração; apagar o resto do build | — | download menor, Lighthouse no celular |

**Juntar com o design de extração:** as fases de saque, equipamento e invasões vêm **depois do P1**, já
desenhando itens e salas em pixel. Assim nada é feito duas vezes.

## 5. Custos estimados

- **Gemini:** gastos US$ 9,15 de US$ 10. P3 a P6 pedem cerca de 25 a 35 imagens (cerca de US$ 4 a 5).
  Seria preciso **subir o teto para uns US$ 15**.
- **PixelLab:** depende do plano. A prova de estilo (P0) mostra quanto custa um personagem completo antes
  de decidir.
- **Tempo:** P0 e P1 são a parte técnica; P2 a P6 são produção de arte. O que trava é a arte, não o código.

## 6. O que preciso que você decida

1. **Pixel art para tudo, ou um híbrido?** Jogo em pixel com as ilustrações pintadas mantidas na ficha,
   no cartão de local e nas cenas de final.
2. **16-bit (32 cores, mais detalhe, como os conceitos) ou 8-bit (16 cores, mais bruto)?** A prévia
   `previa-abrigo.jpg` mostra a diferença de resolução.
3. **Posso testar o PixelLab** para os personagens na prova de estilo?
4. **Subir o teto do Gemini** para cerca de US$ 15?

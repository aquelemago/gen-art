# 003 — Tear

> Um tecido de glifos de pixel, atravessado por uma faixa lisa cujas bordas esgarçam.

## Conceito

A tela é um tear: uma grade de 96×90 células, e cada célula é um glifo de 6×6 pixels
(pontos, xadrez, triângulos, disco, losango, cruz, "8", estrela…) com uma cor de frente
e uma de fundo. A trama é tecida em **corridas horizontais**: o fio passa por várias
células com o mesmo ponto antes de trocar. Dois motivos se repetem: o **pico** (dois
triângulos que se encostam) e a **palavra** (uma corrida de glifos sobre um fundo só,
quase sempre âmbar).

Atravessando a trama corre a **faixa**: 7 a 11 linhas de blocos grandes e calmos
(grafite pontilhado, listras, xadrez, um único bloco âmbar), metade deles cortados em
cima/embaixo. Acima dela, um **letreiro**: uma linha de glifos brancos sobre preto.
À direita, a **ourela**: coluna escura de pontos e uma régua de marcas.

## Movimento (por quadro, determinístico)

1. **Esgarçar** — células até 5 linhas acima e abaixo da faixa são re-sorteadas com
   probabilidade `0,22·e^(−0,75·d)`: puxam o ponto da faixa para fora, arrastam um
   vizinho de lado, viram um ponto solto ou voltam ao original.
2. **Respirar** — 10 trechos curtos da trama deslizam uma célula por quadro.
3. **Memória** — 220 células por quadro voltam ao tecido de origem, para o desgaste
   não virar ruído.
4. **Canto roído** — a trama vaza devagar para dentro da ourela no canto inferior.

O quadro N de uma seed é sempre o mesmo (PRNG `mulberry32` semeado por `hash(seed, N)`).

## Paleta

`#c5c8d0` névoa/fundo · `#000000` preto · `#505050` grafite · `#ffffff` branco ·
`#feb600` âmbar · `#9a6cf0` lilás. Medida (e arredondada) do vídeo de referência
`ratio-75.webm` que serviu de ponto de partida; os glifos, a gramática da trama e as
regras de movimento são próprios desta peça.

## Uso

- `index.html?seed=42` — sem `seed`, sorteia uma e grava na URL.
- `?escala=K` — pixels de tela por pixel de glifo (padrão 2 → 1152×1080).
- `?passos=N&solo=1` — avança N quadros e para (usado por `ferramentas/renderizar.sh`).
- `?capture=1` — pausa e expõe `window.step(n)`.
- Teclas: **S** salva PNG · **R** nova seed · **Espaço** pausa.

```bash
ferramentas/renderizar.sh 003-tear 42 90 1152 1080
```

## Seeds favoritas

- `42` — faixa alta, bloco âmbar à esquerda.
- `7` — faixa baixa, abaixo do meio.
- `2024` — faixa com xadrez e triângulos, âmbar no canto.

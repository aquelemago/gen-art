# 002 — Glossa

> Uma obra que comenta a outra: a 001 medida e reescrita pelas próprias regras.

## Filosofia algorítmica: "Gramática Falada"

A 001 (Correntes) foi medida quadro a quadro (`ferramentas/analisar_gif.py`) e virou
uma gramática de duas regras. Esta peça não copia a imagem anterior: ela *fala* as duas
regras ao mesmo tempo e deixa as regras brigarem entre si.

**REGRA A (cor → movimento).** Nascer com uma cor é nascer com um desvio de direção
(`padrao.angulo_fio_graus` − ângulo dominante de 112°), com um multiplicador de
velocidade (`movimento.rapidez_relativa`, de 0,51× a 3,22×) e com uma tendência de
avanço (`movimento.angulo_avanco_graus`, puxada por `movimento.forca_degradue`).

**REGRA B (velocidade → cor).** A cada quadro a partícula mede o próprio ritmo —
rapidez relativa da cor atual × magnitude do campo — e troca de cor para a paleta que
corre naquele ritmo (a mais próxima em rapidez relativa), com um *hold* de 14 quadros
para não trocar no ruído. A cor muda, logo o movimento muda, logo o ritmo muda: as
duas regras se perseguem num laço de realimentação. Uma partícula que acelera vai
clareando; ao clarear, a Regra A a faz correr ainda mais rápido.

O que se mede na tela é a consequência: fios de uma só cor que alongam e clareiam no
mesmo lugar, e bolsões escuros onde o ritmo caiu e a cor esfriou junto.

### O que foi medido (e o que não)

O GIF da 001 não transla — ele **acumula luz**: 37% dos pixels clareiam quadro a
quadro e só 0,1% escurecem; as células que nunca acendem são 2%. Não há *block
matching* a fazer. O que se extraiu foi dL/dt (variação de luminância), o tensor de
estrutura (orientação local) e −∇L:

| # | Cor | Share | Lumin. | Fio | Coerên. | Rapidez | Avanço |
|---|-----|-------|--------|-----|---------|---------|--------|
| 1 | `#0f181a` | 37,4% | 21,6 | 119° | 0,74 | 0,51× | 171° |
| 2 | `#192628` | 29,7% | 34,3 | 118° | 0,73 | 0,83× | −124° |
| 3 | `#23383a` | 18,4% | 49,3 | 111° | 0,78 | 1,29× | −142° |
| 4 | `#4b4433` | 5,1% | 64,8 | 111° | 0,68 | 1,73× | 6° |
| 5 | `#375c5d` | 6,6% | 79,9 | 97° | 0,77 | 2,22× | −137° |
| 6 | `#7a7c66` | 2,8% | 116,0 | 101° | 0,78 | 3,22× | −171° |

A velocidade → cor é **monótona**: quanto mais rápido o ponto na imagem, mais clara a
cor média ali (luminância 13,7 → 51,4 por faixa de ritmo). É essa monotonicidade que a
Regra B inverte em instrução de pintura. A paleta não foi escolhida: foi medida na 001
(por cor de fio, pool estratificado em 8 faixas de luminância × 4000 px, atribuição de
cada célula por RGB mais próximo).

## O campo e a luz

O campo novo não é o antigo: é ruído semeado, com os componentes trocados (a troca de
sinal cria as linhas de água parada entre giros), `CELL` 8 px — o mesmo bloco da
análise — e magnitude normalizada para média 1.

A luz **não** vem da magnitude do campo. Ela tem uma máscara de ruído própria e
independente, à moda da 001, levada ao intervalo 0..1 pelo quantil 5..95 e atenuada
nas bordas (0,7..1). Não é cosmético: luz derivada da magnitude se **retroalimenta** —
onde a corrente converge a magnitude sobe, a luz sobe, o nível sobe, e a mesma zona
concentra partículas e tinta. Com a luz desacoplada, a exposição para de oscilar de
seed para seed (p99 saía de 112 a 252, com estouro em 255). O nível de cada segmento
sai da luz da célula com dither por partícula, `tier = min(2, (luz×2,4 + dither×0,9 −
0,15)|0)`, o mesmo dither da 001 que dissolve a grade em vez de cortar nela.

## Tinta e luz: o split

O acúmulo `lighter` tem um limiar de quantização: um traço de
`rgba(15,24,26,0,0315)` soma `(0,47, 0,76, 0,82)` no canvas e o canal vermelho, abaixo
de 0,5, é **descartado** — só o azul passa. A tela ficava azul onde só a cor mais
escura pintava (56 954 px deturpados). A regra corrigida: a cor é **tinta**
(`source-over`, apaga luz) se seu canal mais fraco não limpa 0,5 no alfa mínimo, ou
seja, se `min(canais) × opacity × GANHO × exposicao × 0,5 × alfaCor × TIERS[nível] <
0,5`; é **luz** (`lighter`) caso contrário. A conta é **por (cor × nível)**, não por
cor, porque o realce de croma do nível 2 abaixa o canal mais fraco justamente onde o
alfa é maior. Hoje: 20 px deturpados na seed 42 (a referência 001 tem 396 pixels com
azul dominante, todos teal intencional).

Daí vem um degrau que limita a calibração: abaixo de `GANHO` ≈ 2,12 as duas cores mais
escuras (67% da tinta) caem para `source-over` de uma vez e a tela desaba (p90 cai de
64 para 40 num salto). `GANHO` 2,5 é o menor valor confortavelmente dentro do regime
só-luz.

## Croma no topo da rampa

A crítica visual mediu o problema que os números globais escondiam: o **croma dos
claros** (pixels lum > 60) da 002 era 15,6 contra 40,6 da referência — a paleta
medida tem a oposição quente-frio, mas o acúmulo aditivo de cores escuras e
dessaturadas a lavava em "duas nuances do mesmo cinza-prateado". A 001 tem croma alto
só nos claros.

A correção é o mesmo mecanismo: o nível 2 (topo da rampa) entra com a cor
**dessaturada para fora**, `cor' = luminância + (cor − luminância) × CROMA` (2,2),
mantendo a matiz medida. O fator é **limitado por (cor × nível) pelo limiar de
quantização**: o realce empurra o canal mais fraco para baixo, e se ele cruzar o
limiar a quantização o descarta e a cor vira azul — foi o que aconteceu com a cor mais
escura no nível 2 (canal 15 → 7, folga de 0,1). O croma cresce o máximo que a
aritmética dos alfas permite. Resultado: croma dos claros 24,8 / 31,8 / 34,1 nas seeds
42 / 7 / 2024 (era 15,6 / 18,4 / 17,6; referência 40,6), e o nível 2 teve de ser
comprimido de 1,45 para 1,25 para segurar o clipping que o croma acelera (2,92% →
1,93% na seed 2024).

Também se testou um **piso de luz na borda** (a janela de ruído chega a 0 nos 10%
externos, e as quinas da seed 7 mediam 10,9 lum contra 16,9 da referência). O piso
0,6 piorou tudo: croma dos claros caiu de 27,8 para 18,3 (achatar a luz espalha o
nível 2 e o acúmulo lava o croma) e as quinas não se moveram (18,6 → 18,3) — o que
falta nas quinas é **partícula**, não luz, e a distribuição de partículas é a medida.
A borda escura é o preço da composição; a referência também tem regiões vazias. O
default ficou piso 0, com `?piso=` para refazer o experimento.

## Exposição por seed

O total de tinta é fixo (partículas × quadros × comprimento do traço), mas a média não:
as partículas nascem onde a medição diz e daí a corrente decide — nas zonas de luz alta
elas ainda puxam o nível para cima, e o efeito compõe. A correção divide o ganho pela
luz média onde as partículas nascem, com *clamp* [0,5, 2]: a seed passa a decidir
sobretudo a **composição**, não o brilho. `?expo=0` desliga, para comparar. Só
compensa o que dá para prever no nascimento; o resto da variação entre seeds vem da
convergência espacial da corrente e é aceito como característica da peça (a 001 também
varia; lá a variação é a massa d'água que se instala).

## Parâmetros

### Ajustáveis no painel (padrão)
| Parâmetro | Padrão | Faixa | Efeito |
|---|---|---|---|
| Partículas | 5000 | 500–12000 | densidade de fios (mudar N muda a sequência da seed) |
| Escala do ruído | 1,4 | 0,5–5 | giros ao longo do lado menor |
| Velocidade | 1,6 | 0,3–4 | px/quadro na corrente mais forte (a 1080 px) |
| Desvio | 1 | 0–2 | 1 = desvio de direção medido na 001 |
| Avanço | 0,15 | 0–2 | 1 = avanço medido na 001 (0,15 = apenas um viés) |
| Espessura | 0,7 | 0,2–3 | largura do rastro (a 1080 px) |
| Opacidade | 0,10 | 0,01–0,3 | alfa de cada segmento |

### Constantes da obra
`MAX_FRAMES` 900 · `CELL` 8 px · `HOLD` 14 quadros · `STILL` 0,06 · `MAG_MIN` 0,35 ·
`FOCO` 0,45 · `GANHO` 2,5 · `CONTRASTE_MIN` 0,45 · `VIDA` [140, 400] quadros ·
`TIERS` 0,7/1,0/1,25 · `CROMA` 2,2 (limitado pelo limiar de quantização, por cor ×
nível) · luz por quantil 5..95, janela de ruído com piso 0, borda 0,7..1 ·
exposição por seed com clamp [0,5, 2].

## Uso
- `index.html?seed=42`. Sem seed, uma aleatória é gravada na URL.
- **S** salva PNG · **R** nova seed · **Espaço** redesenha.
- `?passos=N` render síncrono; `?solo=1` só o canvas (1080×1350, exportação).
- `?dbg=1` diagnóstico no `<title>`: pixels azuis deturpados (vermelho < 12, para
  não contar o teal intencional), alfa mínimo, densidade × campo × nível ×
  luminância por terço, estilos usados.
- Overrides de calibração na URL: `?ganho= &contraste= &foco= &croma= &tinta=0 &luz=ruido|magnitude &t0= &t1= &t2= &vida= &piso= &expo=0 &p_<parametro>=`.

## Seeds
| Seed | Nota |
|---|---|
| **42** | a mais equilibrada: partículas 1423/1808/1769 por terço, batendo com a medição 30/35/35; exposição colada na referência (p50×1,07 p90×0,99 p99×1,03), clipping 0,01%. **Exportada.** |
| **7** | corrente concentrada: leque quente-frio no alto-esquerda e pool teal no baixo-centro; p90×1,79 da referência, o fim mais quente que ainda não estoura (clipping 0,6%). **Exportada.** |
| 2024 | o fim quente da faixa: núcleo claro com p99 241 e clipping 1,9%, onde a corrente converge sobre a luz alta. Exportada como exemplo do limite. |
| 137 | mais quente ainda (p90 188, p99 255) — não exportada; existe para documentar a faixa real. |

## Desvios e histórico
- **Split tinta/luz** (`source-over`/`lighter` por `ehTinta[]`, agora por cor ×
  nível): a 001 compõe tudo em `lighter`, mas a paleta dela é 3× mais clara (lum
  65–238 contra 22–116 aqui); com esta paleta, tudo-luz produziria azul, e tudo-tinta
  apagaria a luz.
- **`GANHO` 2,5** e **`CONTRASTE_MIN` 0,45**: calibrados contra a degrau de
  quantização acima descrito.
- **Croma no nível 2** (`CROMA` 2,2, limitado pelo limiar): resposta à crítica
  visual, que mediu o croma dos claros a metade da referência. `TIERS[2]` desceu de
  1,45 para 1,25 na mesma rodada, para segurar o clipping que o croma acelera.
- **Luz desacoplada do fluxo** (`LUZ_FONTE='ruido'`): decisão de exposição, ver
  acima.
- **Exposição por seed**: corrige o brilho herdado da convergência do campo.
- **`FOCO` 0,45** (001: 0,6) e **`VIDA` [140,400]** (001: [80,320]): vida longa alonga
  o fio e entrega a partícula à corrente; vida curta (×0,55 testado) faz ela mal sair
  do nascimento e piora a distribuição.
- **Spawn do foco pelo terço medido**: a posição nasce sempre pela distribuição medida
  da cor; o foco só puxa a vertical quando o alvo cai dentro do terço sorteado. Sem
  isso, 45% dos nascimentos iam para um disco que podia nunca tocar a base (base morta:
  0% contra os 35% medidos).
- **Piso de luz na borda: testado e recusado.** A janela de ruído zera a luz nos 10%
  externos e as quinas da seed 7 medem 10,9 lum contra 16,9 da referência; um piso 0,6
  para levantá-las derrubou o croma dos claros de 27,8 para 18,3 e não moveu as quinas
  (18,6 → 18,3) — o que falta nas quinas é partícula, não luz, e a distribuição de
  partículas é a medida. Default piso 0; `?piso=` refaz o experimento.
- **Bordas escuras, aceitas**: como acima, a energia até a borda da 001 não veio de
  um piso de luz e sim da incompressibilidade do curl — esta peça tem correntes
  convergentes por construção, e os vazios são o preço.
- **Croma global ainda abaixo da referência** (11,9–14,9 contra 15,6): o croma dos
  claros se aproxima (24,8–34,1 contra 40,6), mas os escuros, que são 70% da tela,
  continuam quase acromáticos por serem as cores medidas.
- Diagnóstico e calibração feitos com `ferramentas/medir.py` (exposição, quinas,
  croma dos claros e clipping contra a referência 001) e com o `?dbg=1`;
  determinismo verificado por md5 idêntico entre dois renders da mesma seed.
  O detector de azul do `medir.py` foi corrigido para exigir vermelho < 12, senão ele
  conta o teal intencional (que a própria referência tem, 396 px) como deturpado.

## Créditos
- Gramática medida da obra **001 — Correntes** deste mesmo repositório, com
  `ferramentas/analisar_gif.py` (dL/dt, tensor de estrutura, −∇L; sem block matching —
  o GIF acumula luz, não transla).
- Modelo de luz por quantil com dither e níveis: a própria 001.
- p5.js 1.7.0 (LGPL-2.1), via cdnjs.

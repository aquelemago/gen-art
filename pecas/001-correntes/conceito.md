# 001 — Correntes

> Fios de luz sobre água escura: correntes oceânicas vistas de cima, à noite.

## Filosofia algorítmica: "Maré Incompressível"

A água não se cria nem se perde; apenas circula. A obra parte dessa restrição física e a transforma em regra estética. O campo de correntes não é um ruído qualquer apontando direções: é o *curl* de uma função de corrente, um campo de divergência zero. Nenhuma região acumula partículas e nenhuma as drena. Os fios não colapsam em pontos de fuga e se comportam como um fluido incompressível. A calma da imagem vem dessa conservação e não de uma escolha de cor.

A função de corrente é ruído Perlin com *domain warp*, ou seja, ruído amostrado em coordenadas que o próprio ruído desloca. O warp dá aos giros a assimetria de redemoinhos reais. Uma deriva constante, também sem divergência e com direção escolhida pela seed, estica esses giros em jatos e meandros. É a diferença entre um mármore e um oceano: a água tem para onde ir.

As partículas são marcadores passivos. Nascem, percorrem a corrente por uma vida curta e morrem nas bordas, ao fim da vida ou ao entrar em água parada. Cada segmento soma luz ao canvas (blend aditivo, alfa baixo), sem nunca apagar o fundo. A imagem é a integral do movimento: onde muitas trajetórias coincidem, a luz se adensa em fios brilhantes; onde a água é lenta ou vazia, sobra o escuro. A obra se desenha ao longo de 900 quadros e então se assenta.

A cor é uma propriedade da água, não do traço. Um campo de "temperatura" de baixa frequência divide o mar em massas frias (teal profundo, teal, verde-espuma, espuma), repartidas por quantis para que cada seed tenha a mesma economia de cor. Cada partícula herda a cor do lugar onde nasceu e a carrega consigo, como uma massa d'água que viaja com a corrente. O âmbar é um núcleo quente: aparece só onde a luz é mais forte, como uma corrente quente que aflora.

A luz tem hierarquia. Um foco de baixíssima frequência, contido no interior do quadro e atenuado por uma vinheta, define três níveis de intensidade. Ele também puxa 60% dos nascimentos em sua direção. O olho encontra uma corrente principal e as laterais recuam. Cada parâmetro (a fração do foco, os quantis, a amplitude do warp, o piso de luz) foi ajustado olhando várias seeds, nunca uma só. A mesma seed refaz sempre a mesma imagem.

### Referência conceitual
O campo sem divergência e as massas d'água que levam a temperatura consigo remetem, discretamente, à circulação oceânica de grande escala: correntes quentes que cruzam águas frias sem se misturar de imediato.

## Paleta

Escolhida entre três propostas derivadas da skill `theme-factory`:

| # | Nome | Base | Fundo | Rastros |
|---|---|---|---|---|
| 1 | Abissal | Ocean Depths | `#06090d` | `#1f5f66` `#2d8b8b` `#a8dadc` `#f1faee` |
| 2 | Nebulosa Marinha | Midnight Galaxy | `#0a0812` | `#3b3f7a` `#6f6aa8` `#a490c2` `#e6e6fa` |
| **3** | **Bioluminescência** | Ocean Depths + acento quente | **`#04070a`** | **`#15535c` `#2f9e9a` `#8fd6cf` `#e8f4ef` `#e0a458`** |

**Escolhida: Bioluminescência.** As paletas 1 e 2 são monocromáticas e frias, e somadas em milhares de fios viram névoa de um tom só. A 3 mantém a família teal/espuma, que lê como água, e acrescenta um âmbar complementar que funciona como ponto focal e como "temperatura". O fundo puxado para azul-esverdeado evita um preto morto. A espuma `#e8f4ef` entra com alfa ×0,8, para que o pico de brilho seja ciano e não cinza.

## Parâmetros

### Ajustáveis no painel (padrão)
| Parâmetro | Padrão | Faixa | Efeito |
|---|---|---|---|
| Partículas | 5000 | 500–12000 | densidade de fios (mudar N muda a sequência da seed) |
| Escala do ruído | 1,2 | 0,5–5 | giros ao longo do lado menor |
| Velocidade | 1,6 | 0,3–4 | px/quadro na corrente rápida (a 1080 px) |
| Espessura | 0,7 | 0,2–3 | largura do rastro (a 1080 px) |
| Opacidade | 0,10 | 0,01–0,3 | alfa de cada segmento |

### Constantes da obra
`MAX_FRAMES` 900 · `CELL` 6 px · `WARP` 1,2 · `DRIFT` 0,3 · `STILL` 0,08 · `MASS_SHARE` 30/62/86% · núcleo quente = 18% mais quentes da zona com luz > 0,6 · `FOCUS_SPAWN` 0,6 · `FOCUS_MARGIN` 22% · níveis de luz 0,55/0,78/1,0 · vinheta −30% nos 10% externos.

## Uso
- `index.html?seed=90517`. Sem seed, uma aleatória é gravada na URL.
- **S** salva PNG · **R** nova seed · **Espaço** redesenha.
- `?capture=1` pausa o loop; `window.step(n)` avança n quadros (exportação determinística).

## Seeds
| Seed | Nota |
|---|---|
| **90517** | a mais forte: eixo diagonal ciano→âmbar, massa teal à esquerda como contrapeso. **Exportada.** |
| 7 | variante quente: jato âmbar/branco na base. |
| 4242 | âmbar grande à direita, giros no terço inferior. |

## Histórico
- **v0**: curl de ruído + warp 2,2, alfa 0,06, cores por limiar fixo. Escura, monocromática, sem foco, âmbar ausente.
- **v1** (crítica 1 + performance): alfa 0,10; massas por quantis; âmbar como máscara própria; foco × vinheta em 3 níveis com dither; spawn guiado pelo foco; deriva 0,2; mata partículas paradas; escala 1,6→1,2; warp 1,5. Performance: `lerp` inline, cache do campo, `sqrt` no lugar de `hypot`, sem `backdrop-filter`.
- **v2** (crítica 2): espuma ×0,8; âmbar ancorado no foco; foco no interior (margem 22%); piso de luz 0,55; warp 1,2; deriva 0,3.

## Créditos
- Curl noise para campos sem divergência: R. Bridson, R. Hourihan, M. Nordenstam, *Curl-Noise for Procedural Fluid Flow* (SIGGRAPH 2007).
- Domain warping: Inigo Quilez, "domain warping" (iquilezles.org).
- Paleta derivada do tema *Ocean Depths* da skill `theme-factory` (anthropics/skills).
- p5.js 1.7.0 (LGPL-2.1), via cdnjs.

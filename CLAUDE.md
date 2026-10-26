# gen-art

Arte generativa com p5.js. Cada obra é um sketch determinístico: a mesma seed sempre produz a mesma imagem.

## Fluxo de trabalho

1. **Ideia** — uma frase sobre o conceito, o movimento ou a sensação. Nada de "no estilo de <artista>".
2. **Paleta** — skill `theme-factory`: escolher um dos temas em `themes/` ou gerar um tema novo. Usar só as cores; as fontes do tema não importam aqui.
3. **Sketch** — skill `algorithmic-art` (filosofia algorítmica → p5.js com seed e controles) ou skill `genart` (determinismo por hash, PRNG `sfc32`, sub-streams, independência de resolução, features). Para obras que serão publicadas ou impressas, seguir `genart/references/determinism.md` e `resolution.md`.
4. **Otimização** — subagente `javascript-pro`: performance do loop de desenho, vazamentos de memória, uso correto do PRNG.
5. **Ver o resultado** — abrir `pecas/NNN-nome/index.html` no navegador e tirar um screenshot (salvar em `renders/`). Nunca descrever uma mudança visual sem ter olhado a imagem.
6. **Crítica visual** — subagente `ui-designer`, com o screenshot: composição, hierarquia, contraste, harmonia da paleta, densidade.
7. **Iterar** — voltar ao passo 3 ou 4 com a crítica. Olhar várias seeds, não uma só.
8. **Exportar**
   - PNG em alta resolução: re-renderizar em canvas maior (não ampliar). Para peças estáticas com tipografia e composição de pôster, skill `canvas-design` (fontes em `canvas-design/canvas-fonts/`).
   - GIF: skill `slack-gif-creator` (limites de tamanho, FPS, cores, loops). Ver a nota abaixo sobre os scripts.

`code-reviewer` e `frontend-developer` ficam disponíveis para revisões de código e para a página do viewer, quando necessário.

## Convenções

- **Uma pasta por obra:** `pecas/NNN-nome/` (ex.: `pecas/001-campo-de-fluxo/`), com `index.html`, `sketch.js` e `README.md` (conceito, paleta, seeds favoritas).
- **Seed na URL:** `index.html?seed=12345`. Sem `seed`, gerar uma aleatória e gravá-la de volta na URL (`history.replaceState`) para que todo resultado vire um link reproduzível.
- **Teclas:**
  - `S` salva PNG com a seed no nome (`NNN-nome_seed-12345.png`).
  - `R` gera uma nova seed, atualiza a URL e re-renderiza.
  - Ignorar teclas quando o foco estiver em `input`/`textarea`.
- **Determinismo:** toda aleatoriedade passa por `randomSeed(seed)` / `noiseSeed(seed)` ou pelo PRNG seedado. Nada de `Math.random()`, `Date.now()` ou `performance.now()` no desenho; animações são guiadas por contador de frames.
- **Tamanho:** desenhar em espaço normalizado (frações do lado menor do canvas) para que a obra seja a mesma em 800 px e em 4000 px.
- **Renders:** screenshots e exportações vão para `renders/`, com o nome `NNN-nome_seed-XXXX.png|gif`.
- **Originalidade:** obras originais. Técnicas (flow fields, circle packing, Truchet, reaction-diffusion etc.) são patrimônio comum; o estilo característico de um artista vivo não é. Se pedirem "no estilo de X", oferecer a técnica e não a imitação (ver `genart/references/ethics.md`).
- **Créditos:** citar no README da obra o algoritmo, o shader ou a paleta que vierem de outra pessoa.

## Notas sobre as skills instaladas

- `slack-gif-creator`: os scripts Python (`core/*.py`) e o `requirements.txt` **não foram copiados**; a skill ficou só com o conhecimento (limites, conceitos de animação). Para gerar GIFs, montar os frames exportados do p5.js com `ffmpeg` ou `gifski`, ou copiar `core/` do repositório anthropics/skills se for preciso.
- `genart`: o SKILL.md cita `check.mjs` e `render.mjs` em `$CLAUDE_PLUGIN_ROOT/scripts/`. Esses scripts **não estão instalados** (a skill foi copiada como skill de projeto, não como plugin). As verificações de determinismo podem ser feitas à mão, seguindo `references/verification.md`.
- `algorithmic-art`: o template `templates/viewer.html` carrega p5.js do cdnjs e fontes do Google Fonts, e usa a identidade visual da Anthropic na barra lateral. Neste projeto, a UI do viewer pode ser adaptada; o que importa manter são os controles de seed.
- Os subagentes do VoltAgent mencionam um "context-manager" que não existe aqui; ignorar esse protocolo e ler o contexto direto dos arquivos.

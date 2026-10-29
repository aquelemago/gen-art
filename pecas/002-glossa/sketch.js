/* ══════════════════════════════════════════════════════════════════════════
   002 — Glossa

   A 001 foi medida (ferramentas/analisar_gif.py) e virou uma gramática:
   uma tabela cor → movimento e uma tabela velocidade → cor. Esta peça não
   copia a imagem anterior: ela *fala* as duas regras ao mesmo tempo e deixa
   as regras brigar.

     REGRA A (cor → movimento): nascer com uma cor é nascer com um desvio
       de direção (padrao.angulo_fio_graus − ângulo dominante), com um
       multiplicador de velocidade (movimento.rapidez_relativa) e com uma
       tendência de avanço (movimento.angulo_avanco_graus, puxada por
       movimento.forca_degradue).

     REGRA B (velocidade → cor): a cada quadro a partícula mede o próprio
       ritmo — rapidez_relativa da cor atual × magnitude do campo — e troca
       de cor para a paleta que corre naquele ritmo (a mais próxima em
       rapidez_relativa). A cor muda, logo o movimento muda, logo o ritmo
       muda: as duas regras se perseguem.

   O campo novo não é o campo antigo: é ruído semeado cujo ângulo dominante
   e cuja dispersão angular vêm do histograma medido na 001, e cuja
   magnitude abre dois regimes (correntes e águas paradas na fronteira).

   Tudo determinístico pela seed: mesma seed, mesma imagem.
   URL: index.html?seed=12345 · ?passos=900 renderiza N quadros de uma vez
        (captura) · ?capture=1 pausa o loop e expõe window.step(n)
   Teclas: S salva PNG · R nova seed · Espaço redesenha
   ══════════════════════════════════════════════════════════════════════════ */

// ── Constantes da obra ─────────────────────────────────────────────────────
const W = 1080, H = 1350;
const MAX_FRAMES = 900;      // a obra "assenta" após 15 s a 60 fps
const CELL = 8;              // px por célula do campo (mesmo bloco da análise)
const HOLD = 14;             // quadros que um ritmo precisa durar para trocar de cor
const STILL = 0.06;          // abaixo disso o campo está parado
const MAG_MIN = 0.35;        // fundo do campo: onde as correntes se esbarram

// Overrides de experimentação na URL — calibrar a exposição sem editar o
// arquivo: ?ganho=2.5&contraste=0.6&foco=0.3&tinta=0&p_opacity=0.14
const QY = new URLSearchParams(location.search);
const qnum = (k, d) => (QY.has(k) && isFinite(parseFloat(QY.get(k))) ? parseFloat(QY.get(k)) : d);

// vida da partícula, em quadros — a 001 usa [80,320]; vida longa alonga o
// fio, mas deixa a partícula viver tempo suficiente para ser arrastada até
// onde a corrente converge, e aí a concentração estoura o branco
const VIDA_FATOR = qnum('vida', 1);
const VIDA = [140 * VIDA_FATOR, 400 * VIDA_FATOR];

const FOCO = qnum('foco', 0.45);           // fração de nascimentos puxados ao foco
// Ganho global de alfa. 2.5 porque há um degrau em ~2.12: abaixo dele a cor
// mais escura da paleta (#0f181a, 37% da tinta) não limpa 0.5 no canal mais
// fraco e passa a ser composta em source-over — que apaga luz em vez de
// somar — e a tela desaba (p90 cai de 64 para 40 num salto). 2.5 ainda cai
// dentro do regime só-luz, com margem.
const GANHO = qnum('ganho', 2.5);
const CONTRASTE_MIN = qnum('contraste', 0.45);  // alfa relativo da cor mais escura
const USAR_TINTA = QY.get('tinta') !== '0'; // 0 = tudo em 'lighter'
const LUZ_FONTE = QY.get('luz') || 'ruido';  // 'ruido' (própria) | 'magnitude'
// multiplicador de alfa por nível de luz. O topo é o que estoura em branco
// nas seeds de corrente concentrada, e o realce de croma do nível 2 acelera
// a saturação do canal mais alto — 1,25 deixa o clipping em 0,6–1,9% contra
// 1,1–2,9% em 1,45, com croma dos claros ainda 2× o original. ?t2= ajusta.
const TIERS = [qnum('t0', 0.7), qnum('t1', 1.0), qnum('t2', 1.25)];

// ── Gramática medida (gramatica.js, gerado pela análise do GIF) ────────────
const G = window.GRAMATICA;

const PALETA = G.paleta;                                          // escura → clara
const RAPIDEZ = PALETA.map(p => p.movimento.rapidez_relativa);    // × a média
const FORCA = PALETA.map(p => p.movimento.forca_degradue);
const DESVIO = PALETA.map(p => p.padrao.angulo_fio_graus - G.movimento_global.angulo_fio_dominante_graus);
const AVANCO = PALETA.map(p => p.movimento.angulo_avanco_graus);
const PESO = PALETA.map(p => p.share);
const REG = PALETA.map(p => p.regioes);
const HEX = PALETA.map(p => p.hex);
const N_CORES = PALETA.length;

const ANG_DOM = G.movimento_global.angulo_fio_dominante_graus;
const RAP_MEDIA = RAPIDEZ.reduce((a, v, i) => a + v * PESO[i], 0) /
                  PESO.reduce((a, v) => a + v, 0);
const FORCA_MEDIA = FORCA.reduce((a, v, i) => a + v * PESO[i], 0) /
                    PESO.reduce((a, v) => a + v, 0);

// dispersão angular medida: desvio médio dos binos em relação ao ângulo dominante
const HIST = G.histograma.angulo_fio;
const CENTROS = HIST.limites.slice(0, -1).map((v, i) => (v + HIST.limites[i + 1]) / 2);
const PESO_HIST = HIST.contagens.reduce((a, v) => a + v, 0);
const DISPERSAO = CENTROS.reduce((a, c, i) =>
    a + Math.abs(c - ANG_DOM) * HIST.contagens[i], 0) / PESO_HIST;

// ── Parâmetros ─────────────────────────────────────────────────────────────
function readSeedFromURL() {
    const s = parseInt(new URLSearchParams(location.search).get('seed'), 10);
    // único uso legítimo de Math.random: escolher QUAL obra ver, nunca como desenhá-la
    return s > 0 ? s : Math.floor(Math.random() * 999999) + 1;
}

let params = {
    seed: readSeedFromURL(),
    particles: 5000,
    escala: 1.4,       // nº de giros do campo ao longo do lado menor
    velocidade: 1.6,   // px/quadro na corrente mais forte
    desvio: 1,         // 1 = desvio de direção medido na 001
    avanco: 0.15,      // 1 = avanço medido na 001 (0.15 = apenas um viés)
    weight: 0.7,
    opacity: 0.1,
};
// mesmos overrides, para os deslizantes: ?p_opacity=0.14&p_weight=0.9
for (const k of ['particles', 'escala', 'velocidade', 'desvio', 'avanco', 'weight', 'opacity']) {
    if (QY.has('p_' + k) && isFinite(parseFloat(QY.get('p_' + k)))) params[k] = parseFloat(QY.get('p_' + k));
}

const defaultParams = { ...params };
const captureMode = new URLSearchParams(location.search).has('capture');
const PASSOS = parseInt(new URLSearchParams(location.search).get('passos'), 10) || 0;
const SOLO = new URLSearchParams(location.search).has('solo');
const DBG = new URLSearchParams(location.search).has('dbg');
const estilosUsados = new Set();

// modo solo: só o canvas na tela, 1080×1350 exatos — é o que o renderizar.sh
// captura (a 001 tem PNG 1080×1350; a página inteira seria 1600×2100)
if (SOLO) {
    const css = document.createElement('style');
    css.textContent = `
        body { margin: 0; background: #000; }
        .sidebar { display: none !important; }
        .container { display: block !important; padding: 0 !important; }
        .canvas-area { padding: 0 !important; }
        #canvas-container { max-width: none !important; width: ${W}px;
                            height: ${H}px; margin: 0; border-radius: 0; }
        #canvas-container canvas { width: ${W}px !important;
                                   height: ${H}px !important; }
    `;
    document.head.appendChild(css);
}

// ── Estado ─────────────────────────────────────────────────────────────────
let cols, rows;
let fx, fy;            // vetor do campo por célula (componentes: a troca de
                       // sinal cria as linhas de água parada entre giros)
let magCell;           // magnitude por célula (média normalizada em 1)
let luzCell;           // luz 0..1 por célula (magnitude por quantil × vinheta × borda)
let px, py, pcor, pvie, pvida, phold, pjit, pdit;   // partículas (struct-of-arrays)
let focoX, focoY;
let strokeStyles = [];
let alfaCor = [];         // alfa relativo por cor (curva de contraste medida)
let ehTinta = [];         // 1 = (cor × nível) entra em source-over, sem 'lighter'
let exposicao = 1;        // correção de ganho por seed (ver initializeSystem)
let luzMediaGrade = 0.5;  // luz média da grade, em buildField
let frame = 0;

// ══════════════════════════════════════════════════════════════════════════
// CAMPO
// Ângulo dominante + dispersão do histograma medido; o sinal do ruído de baixa
// frequência decide o sentido do fluxo — onde o sinal cruza zero a magnitude
// cai a MAG_MIN e nasce uma linha de água parada entre dois giros.
// ══════════════════════════════════════════════════════════════════════════

function buildField() {
    cols = Math.ceil(W / CELL) + 2;
    rows = Math.ceil(H / CELL) + 2;
    const S = Math.min(W, H);
    const k = params.escala / S;
    fx = new Float32Array(cols * rows);
    fy = new Float32Array(cols * rows);
    magCell = new Float32Array(cols * rows);

    // 1) campo de sinal, suavizado: a fronteira entre dois giros opostos vira
    //    um canal largo em vez de uma rachadura de uma célula
    let s = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const x = i * CELL, y = j * CELL;
            s[j * cols + i] = noise(x * k * 0.55 + 71.3, y * k * 0.55 + 31.7) * 2 - 1;
        }
    }
    s = boxBlur(s, cols, rows, 2);

    // 2) ondulação do ângulo em torno do ângulo dominante medido + sentido
    let soma = 0;
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const x = i * CELL, y = j * CELL;
            const n1 = noise(x * k, y * k);
            const desvio = (n1 * 2 - 1) * DISPERSAO * 1.35;
            let ang = radians(ANG_DOM + desvio);
            const sg = s[j * cols + i];
            if (sg < 0) ang += PI;
            const mag = MAG_MIN + (1 - MAG_MIN) * Math.pow(Math.min(1, Math.abs(sg) * 3.2), 1.25);
            const id = j * cols + i;
            fx[id] = Math.cos(ang) * mag;
            fy[id] = Math.sin(ang) * mag;
            magCell[id] = mag;
            soma += mag;
        }
    }
    // normaliza a média para 1: o ritmo medido fica comparável ao medido na 001
    const media = soma / (cols * rows);
    for (let id = 0; id < fx.length; id++) { fx[id] /= media; fy[id] /= media; magCell[id] /= media; }

    // LUZ por célula. Duas fontes, escolhidas na URL (?luz=ruido|magnitude):
    //
    //   ruido (padrão) — uma máscara própria, independente da corrente, como
    //     faz a 001. Não é cosmético: luz derivada da magnitude do campo se
    //     retroalimenta — onde a corrente converge a magnitude sobe, a luz
    //     sobe, o nível sobe, e a MESMA zona concentra partículas e tinta.
    //     Com a luz vinda de um ruído próprio as duas coisas se
    //     descorrelacionam e a exposição para de oscilar de seed para seed
    //     (p99 saía de 112 a 252, com estouro em 255).
    //   magnitude — a versão anterior: mag × vinheta, cujo efeito colateral é
    //     riscar a divisória de águas de preto (ali a magnitude cai a MAG_MIN).
    const bruto = new Float32Array(cols * rows);
    const qLuz = LUZ_FONTE === 'magnitude' ? magCell : bruto;
    if (LUZ_FONTE === 'ruido') {
        // A janela chega a ZERO na borda, e era essa a intenção certa: testei
        // um piso de 0,6 para "salvar as quinas" e ele piorou tudo — a medição
        // mostrou croma dos claros caindo de 27,8 para 18,3 (achatar a luz
        // espalha o nível 2 e o acúmulo aditivo lava o croma), enquanto as
        // quinas ficavam exatamente onde estavam (18,6 → 18,3): o que falta
        // nas quinas é partícula, não luz, e a distribuição de partículas é a
        // medida. A borda escura é o preço da composição, e a 001 também tem
        // regiões vazias. ?piso= reintroduz o piso, para comparar.
        const PISO_BORDA = qnum('piso', 0);
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const X = i * CELL, Y = j * CELL;
                const ex = Math.min(X, W - X) / (0.1 * S);
                const ey = Math.min(Y, H - Y) / (0.1 * S);
                const jan = Math.max(0, Math.min(1, Math.min(ex, ey)));
                const suave = jan * jan * (3 - 2 * jan);
                bruto[j * cols + i] =
                    noise(X / S * 0.5 + 300.3, Y / S * 0.5 + 150.7, 5.3) * (PISO_BORDA + (1 - PISO_BORDA) * suave);
            }
        }
    }
    // leva ao intervalo 0..1 pelo quantil 5..95 (mesmo truque da 001): aí a
    // distribuição ocupa os três níveis em vez de 90% dos fios caírem no 0
    const ordenado = Float32Array.from(qLuz).sort();
    const q05 = ordenado[Math.floor(ordenado.length * 0.05)];
    const q95 = ordenado[Math.floor(ordenado.length * 0.95)];
    luzCell = new Float32Array(cols * rows);
    let somaLuz = 0;
    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const X = i * CELL, Y = j * CELL;
            const vx = (X - W / 2) / (W / 2), vy = (Y - H / 2) / (H / 2);
            const vin = LUZ_FONTE === 'magnitude' ? 1 - 0.5 * Math.min(1, vx * vx + vy * vy) : 1;
            const ex = Math.min(X, W - X) / (0.1 * S);
            const ey = Math.min(Y, H - Y) / (0.1 * S);
            const borda = 0.7 + 0.3 * Math.max(0, Math.min(1, Math.min(ex, ey)));
            const f = Math.max(0, Math.min(1, (qLuz[j * cols + i] - q05) / ((q95 - q05) || 1)));
            const l = f * vin * borda;
            luzCell[j * cols + i] = l;
            somaLuz += l;
        }
    }
    luzMediaGrade = somaLuz / (cols * rows);
}

// média móvel (raio r) num campo escalar — sem costurar a imagem inteira
function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            let soma = 0, n = 0;
            for (let d = -r; d <= r; d++) {
                const x = i + d;
                if (x < 0 || x >= w) continue;
                soma += a[j * w + x]; n++;
            }
            tmp[j * w + i] = soma / n;
        }
    }
    const out = new Float32Array(a.length);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            let soma = 0, n = 0;
            for (let d = -r; d <= r; d++) {
                const y = j + d;
                if (y < 0 || y >= h) continue;
                soma += tmp[y * w + i]; n++;
            }
            out[j * w + i] = soma / n;
        }
    }
    return out;
}

// amostragem bilinear do vetor de campo
function sampleField(x, y, out) {
    const gx = x / CELL + 1, gy = y / CELL + 1;
    const i = gx | 0, j = gy | 0;
    if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return 0;
    const ax = gx - i, ay = gy - j;
    const id = j * cols + i, c = cols;
    const tx = ax * (fx[id + 1] - fx[id]) + fx[id];
    const bx = ax * (fx[id + c + 1] - fx[id + c]) + fx[id + c];
    const ty = ax * (fy[id + 1] - fy[id]) + fy[id];
    const by = ax * (fy[id + c + 1] - fy[id + c]) + fy[id + c];
    out.x = ay * (bx - tx) + tx;
    out.y = ay * (by - ty) + ty;
    return Math.sqrt(out.x * out.x + out.y * out.y) * 1;   // magnitude aproximada
}

// amostragem bilinear da luz (o campo escalar luzCell), mesma grade
function sampleLuz(x, y) {
    const gx = x / CELL + 1, gy = y / CELL + 1;
    const i = gx | 0, j = gy | 0;
    if (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) return 0;
    const ax = gx - i, ay = gy - j;
    const id = j * cols + i, c = cols;
    const t = ax * (luzCell[id + 1] - luzCell[id]) + luzCell[id];
    const b = ax * (luzCell[id + c + 1] - luzCell[id + c]) + luzCell[id + c];
    return ay * (b - t) + t;
}

// ══════════════════════════════════════════════════════════════════════════
// NASCIMENTO — a cor nasce pela share medida; a posição nasce pela
// distribuição espacial medida daquela cor, com um foco semeado por cima.
// ══════════════════════════════════════════════════════════════════════════

function sortearCor() {
    const r = random();
    let acc = 0, total = PESO.reduce((a, v) => a + v, 0);
    for (let i = 0; i < N_CORES; i++) { acc += PESO[i] / total; if (r <= acc) return i; }
    return N_CORES - 1;
}

function sortearFaixa(margens) {   // {esquerda,centro,direita} ou {topo,meio,base}
    const ord = Object.keys(margens);
    const total = ord.reduce((a, k) => a + margens[k], 0) || 1;
    let r = random() * total;
    for (const k of ord) { r -= margens[k]; if (r <= 0) return k; }
    return ord[ord.length - 1];
}

function spawn(n) {
    const c = sortearCor();
    pcor[n] = c;

    // A posição nasce SEMPRE pela distribuição espacial medida da cor — terço
    // vertical e horizontal incluídos. O foco é só um puxão por cima: antes,
    // 45% dos nascimentos iam para um disco que, quando o foco nascia alto,
    // nunca tocava a base — a medição diz base 35%, a tela mostrava 0%.
    const faixa = (v, a, b) => v === a ? [0, 1 / 3] : v === b ? [2 / 3, 1] : [1 / 3, 2 / 3];
    const col = sortearFaixa({ esquerda: REG[c].esquerda, centro: REG[c].centro, direita: REG[c].direita });
    const lin = sortearFaixa({ topo: REG[c].topo, meio: REG[c].meio, base: REG[c].base });
    const [cx0, cx1] = faixa(col, 'esquerda', 'direita');
    const [ly0, ly1] = faixa(lin, 'topo', 'base');
    let x = random(cx0 * W, cx1 * W);
    let y = random(ly0 * H, ly1 * H);

    if (random() < FOCO) {
        const a = random(TWO_PI), r = Math.sqrt(random()) * Math.min(W, H) * 0.30;
        const tx = focoX + Math.cos(a) * r;
        const ty = focoY + Math.sin(a) * r;
        x += (tx - x) * 0.7;
        // a vertical só é puxada quando o foco cai DENTRO do terço sorteado;
        // fora dele, o terço medido manda sozinho — é o que mantém a base viva
        if (ty >= ly0 * H && ty <= ly1 * H) y += (ty - y) * 0.7;
    }

    px[n] = x;
    py[n] = y;
    pvida[n] = random(VIDA[0], VIDA[1]) | 0;
    phold[n] = 0;
    pvie[n] = random();          // jitter de ritmo: cada partícula decide sozinha
    pjit[n] = 0.85 + random() * 0.3;
    pdit[n] = random();          // dither do nível de luz (desconta a grade)
}

// ══════════════════════════════════════════════════════════════════════════
// REGRAS
// ══════════════════════════════════════════════════════════════════════════

// REGRA B — ritmo → índice da cor na paleta (a cuja rapidez_relativa é a mais
// próxima). É a inversa da regra A medida: quem corre no ritmo da cor X vira X.
function corPorRitmo(ritmo) {
    let melhor = 0, d = Infinity;
    for (let i = 0; i < N_CORES; i++) {
        const dd = Math.abs(RAPIDEZ[i] - ritmo);
        if (dd < d) { d = dd; melhor = i; }
    }
    return melhor;
}

// ══════════════════════════════════════════════════════════════════════════
// P5.JS
// ══════════════════════════════════════════════════════════════════════════

function setup() {
    const canvas = createCanvas(W, H);
    canvas.parent('canvas-container');
    pixelDensity(1);
    document.querySelector('.loading').style.display = 'none';

    renderSwatches();
    updateSeedDisplay();
    initializeSystem();

    if (PASSOS > 0) {              // captura: roda N quadros de uma vez e para
        for (let i = 0; i < PASSOS && frame < MAX_FRAMES; i++) passo();
        updateStatus();
        window.rendered = drawingContext.canvas;
        noLoop();
    } else if (captureMode) {
        noLoop();
    }
}

function initializeSystem() {
    randomSeed(params.seed);
    noiseSeed(params.seed);

    frame = 0;
    background(4, 7, 10);

    focoX = random(W * 0.28, W * 0.72);
    focoY = random(H * 0.25, H * 0.75);

    buildField();

    const N = params.particles;
    px = new Float32Array(N); py = new Float32Array(N);
    pcor = new Uint8Array(N); pvie = new Float32Array(N);
    pvida = new Int16Array(N); phold = new Int16Array(N);
    pjit = new Float32Array(N);
    pdit = new Float32Array(N);

    for (let n = 0; n < N; n++) spawn(n);

    // EXPOSIÇÃO por seed. O total de tinta é fixo (N × quadros × comprimento
    // do traço), mas a MÉDIA não: as partículas nascem onde a medição diz, e
    // daí a corrente decide — nas zonas de luz alta elas ainda puxam o nível
    // para cima, e o efeito compõe. Dividir o ganho pela luz média onde elas
    // nascem tira da seed parte da conta de brilho: ela passa a decidir
    // sobretudo a composição. Só compensa o que dá para prever no nascimento;
    // o resto da variação vem da convergência da corrente, que só aparece
    // correndo. ?expo=0 desliga, para comparar.
    if (QY.get('expo') === '0') {
        exposicao = 1;
    } else {
        let soma = 0;
        for (let n = 0; n < N; n++) soma += sampleLuz(px[n], py[n]);
        exposicao = Math.max(0.5, Math.min(2, luzMediaGrade / ((soma / N) || 1)));
    }

    // ganho de contraste: o alfa segue a luminância medida da cor. As duas
    // cores "breu" (quase pretas, 64% das partículas) entram com alfa baixo,
    // senão elas lavam a tela de cinza e o âmbar some. Desvio consciente da
    // medição, documentado no README.
    const lums = HEX.map((h) =>
        (parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)) / 3);
    const lo = Math.min(...lums), hi = Math.max(...lums);
    alfaCor = lums.map((l) => CONTRASTE_MIN + (1 - CONTRASTE_MIN) * ((l - lo) / (hi - lo || 1)));

    // Estilos por (cor × nível). Os níveis 0 e 1 entram com a cor medida; o
    // nível 2 — o topo da rampa, onde o olho olha — entra com a mesma cor
    // dessaturada para fora: cor' = luminância + (cor − luminância) × k.
    // A crítica acertou: sem isso os claros da 002 têm croma 15,6 contra 40,6
    // da 001, e a oposição quente-frio medida na paleta não se materializa —
    // vira "duas nuances do mesmo cinza-prateado". A 001 tem croma alto só
    // nos claros; aqui é o mesmo mecanismo. As matizes continuam as medidas;
    // o que muda é a crominância, e só na luz. ?croma=1 desliga.
    //
    // O fator k é LIMITADO por (cor × nível) pelo limiar de quantização: o
    // realce empurra o canal mais fraco para baixo (ele já está abaixo da
    // luminância), e se cruzar o limiar a quantização de 8 bits o descarta a
    // cada traço e a cor vira azul — foi o que aconteceu com a cor mais
    // escura no nível 2 (canal 15 → 7, folga de 0,1). O croma cresce o
    // máximo que a aritmética dos alfas permite, nem um passo além.
    const CROMA = qnum('croma', 2.2);
    const MIN_ALFA = params.opacity * GANHO * exposicao * 0.5;   // 0.5 = cobertura
    strokeStyles = [];
    const canais = [];
    for (let c = 0; c < N_CORES; c++) {
        const r = parseInt(HEX[c].slice(1, 3), 16);
        const g = parseInt(HEX[c].slice(3, 5), 16);
        const b = parseInt(HEX[c].slice(5, 7), 16);
        const lum = (r + g + b) / 3;
        const fraco = Math.min(r, g, b);
        for (let t = 0; t < 3; t++) {
            let k = t === 2 ? CROMA : 1;
            // piso do canal mais fraco: limiar 0,5 com margem 1,6× para a
            // cobertura do traço fino variar sem cruzar o limiar
            const piso = 0.8 / (MIN_ALFA * TIERS[t] * alfaCor[c]);
            if (lum > fraco) k = Math.min(k, (piso - lum) / (fraco - lum));
            k = k < 1 ? 1 : k;
            const realce = (v) => Math.max(0, Math.min(255, Math.round(lum + (v - lum) * k)));
            const tri = [realce(r), realce(g), realce(b)];
            canais.push(tri);
            strokeStyles.push(`rgba(${tri[0]},${tri[1]},${tri[2]},`);
        }
    }

    // tinta x luz: se o canal mais fraco da cor, multiplicado pelo alfa com
    // que ela entra e pela cobertura de um traço fino (0,7 px raramente cobre
    // 100% do pixel), não limpa 0.5, a quantização de 8 bits descarta esse
    // canal em cada traço e a cor deturpa (vira azul). Essa cor entra em
    // source-over; as demais acumulam em lighter. A conta é por (cor × nível)
    // porque o realce do nível 2 abaixa o canal mais fraco e o alfa do nível
    // 2 é o maior — os dois efeitos se encontram justamente ali.
    ehTinta = new Uint8Array(N_CORES * 3);
    if (USAR_TINTA) {
        for (let m = 0; m < N_CORES * 3; m++) {
            const cor = (m / 3) | 0, t = m % 3;
            ehTinta[m] = Math.min(...canais[m]) * MIN_ALFA * TIERS[t] * alfaCor[cor] < 0.5 ? 1 : 0;
        }
    }

    updateStatus();
}

const _f = { x: 0, y: 0 };

function passo() {
    if (frame >= MAX_FRAMES) return;

    const ctx = drawingContext;
    const N = params.particles;
    const base = params.velocidade * uEscala();
    const paths = [];
    for (let i = 0; i < N_CORES * 3; i++) paths.push(new Path2D());

    // alfa por (cor × nível): cor medida × contraste × nível de luz
    const alfa = new Float32Array(N_CORES * 3);
    for (let c = 0; c < N_CORES; c++) {
        for (let t = 0; t < 3; t++) {
            alfa[c * 3 + t] = params.opacity * GANHO * exposicao * alfaCor[c] * TIERS[t];
        }
    }

    for (let n = 0; n < N; n++) {
        const x = px[n], y = py[n];
        const mag = sampleField(x, y, _f);
        if (mag === 0) { spawn(n); continue; }

        const c = pcor[n];

        // ── REGRA A: a cor dá o movimento ──
        const angBase = Math.atan2(_f.y, _f.x);
        const ang = angBase + radians(DESVIO[c] * params.desvio);
        let w = params.avanco * (FORCA[c] / FORCA_MEDIA);
        w = w < 0 ? 0 : w > 0.85 ? 0.85 : w;
        const av = radians(AVANCO[c]);
        let dx = (1 - w) * Math.cos(ang) + w * Math.cos(av);
        let dy = (1 - w) * Math.sin(ang) + w * Math.sin(av);
        const dn = Math.hypot(dx, dy) || 1;
        dx /= dn; dy /= dn;

        const vel = base * RAPIDEZ[c] * mag * pjit[n];
        const nx = x + dx * vel, ny = y + dy * vel;
        pvida[n]--;

        if (pvida[n] <= 0 || mag < STILL || nx < 0 || nx >= W || ny < 0 || ny >= H) {
            spawn(n);
            continue;
        }

        // ── REGRA B: o ritmo dá a cor ──
        const ritmo = (RAPIDEZ[c] * mag) / RAP_MEDIA;
        const alvoCor = corPorRitmo(ritmo + (pvie[n] - 0.5) * 0.12);
        if (alvoCor === c) {
            phold[n] = 0;
        } else if (++phold[n] >= HOLD) {
            pcor[n] = alvoCor;
            phold[n] = 0;
        }

        // nível de luz: a luz da célula (levada a 0..1 pelo quantil) com o
        // mesmo dither da 001 — o dither dissolve a grade em vez de cortar
        // nela, e sem ele a tela só acendia onde o campo tinha um pico raro
        const luz = sampleLuz(x, y);
        const tier = Math.min(2, (luz * 2.4 + pdit[n] * 0.9 - 0.15) | 0);

        const p = paths[pcor[n] * 3 + tier];
        p.moveTo(x, y);
        p.lineTo(nx, ny);
        px[n] = nx;
        py[n] = ny;
    }

    // Duas passadas de composição, porque o acúmulo 'lighter' tem um limiar
    // de quantização: um traço de rgba(15,24,26,0.0315) soma
    // (0.47, 0.76, 0.82) e o canal vermelho, abaixo de 0.5, é DESCARTADO —
    // só o azul passa, e a tela fica azul onde só a cor mais escura pinta.
    // Regra medida: cor é tinta (source-over) se seu canal mais fraco não
    // limpa 0.5 no alfa mínimo; é luz (lighter) caso contrário.
    ctx.lineCap = 'butt';
    ctx.lineWidth = params.weight * uEscala();
    for (let passo_ = 0; passo_ < 2; passo_++) {
        ctx.globalCompositeOperation = passo_ === 0 ? 'source-over' : 'lighter';
        for (let m = 0; m < paths.length; m++) {
            // ehTinta é Uint8Array: compara como número, não com booleano
            if (ehTinta[m] !== (passo_ === 0 ? 1 : 0)) continue;
            const estilo = strokeStyles[m] + alfa[m].toFixed(4) + ')';
            if (DBG) estilosUsados.add(estilo);
            ctx.strokeStyle = estilo;
            ctx.stroke(paths[m]);
        }
    }

    frame++;
    if (frame % 30 === 0 || frame === MAX_FRAMES) updateStatus();
    if (frame >= MAX_FRAMES) {
        window.rendered = drawingContext.canvas;
        if (!captureMode && PASSOS === 0) noLoop();
    }
}

// unidade de tamanho: a obra é desenhada em 1080 px e serve em qualquer largura
function uEscala() {
    return Math.min(W, H) / 1080;
}

function draw() {
    if (PASSOS > 0) return;   // captura já rodou os quadros no setup
    passo();
}

// modo captura: avança n quadros de forma síncrona e determinística
window.step = (n = 1) => {
    for (let k = 0; k < n && frame < MAX_FRAMES; k++) passo();
    return frame;
};

// ══════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════

let restartTimer = null;
const PARAM_KEYS = ['particles', 'escala', 'velocidade', 'desvio', 'avanco', 'weight', 'opacity'];

function updateParam(paramName, value) {
    params[paramName] = parseFloat(value);
    document.getElementById(`${paramName}-value`).textContent = value;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(initializeSystem, 250);
}

function renderSwatches() {
    const el = document.getElementById('swatches');
    el.innerHTML = '';
    HEX.forEach((hex, i) => {
        const p = PALETA[i];
        const s = document.createElement('div');
        s.className = 'swatch';
        s.style.background = hex;
        s.title = `${hex} — ${p.padrao.angulo_fio_graus.toFixed(0)}° · ${p.movimento.rapidez_relativa.toFixed(2)}× · avanço ${p.movimento.angulo_avanco_graus.toFixed(0)}°`;
        el.appendChild(s);
    });
}

function updateStatus() {
    document.getElementById('status').textContent =
        `quadro ${frame}/${MAX_FRAMES} · seed ${params.seed}`;
    if (DBG) {
        if (frame < MAX_FRAMES) {
            document.title = 'estilos: ' + [...estilosUsados].sort().join(' | ');
        } else {
            // diagnóstico único, no fim: varrer o canvas a cada 30 quadros
            // custava ~30 ms por varredura. AZUL = pixels deturpados pela
            // quantização de 8 bits do 'lighter'; PART = densidade × campo ×
            // nível × luminância por terço (medir.py é o par disso, no PNG).
            const d = drawingContext.getImageData(0, 0, W, H).data;
            let azuis = 0, amin = 255;
            const lm = [0, 0, 0], ln = [0, 0, 0];
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                if (d[i + 3] < amin) amin = d[i + 3];
                // azul deturpado = quase sem vermelho; teal intencional tem r>=12
                if (d[i + 2] > d[i] * 3 && d[i + 2] > 40 && d[i] < 12) azuis++;
                const y = (p / W) | 0, t = y < H / 3 ? 0 : y < 2 * H / 3 ? 1 : 2;
                lm[t] += (d[i] + d[i + 1] + d[i + 2]) / 3; ln[t]++;
            }
            const N = params.particles;
            const cnt = [0, 0, 0], mg = [0, 0, 0], tn = [0, 0, 0];
            for (let n = 0; n < N; n++) {
                const t = py[n] < H / 3 ? 0 : py[n] < 2 * H / 3 ? 1 : 2;
                cnt[t]++;
                mg[t] += sampleField(px[n], py[n], _f);
                tn[t] += Math.min(2, (sampleLuz(px[n], py[n]) * 2.4 + pdit[n] * 0.9 - 0.15) | 0);
            }
            document.title = `AZUL ${azuis}px alfaMin=${amin} · PART ` + cnt.map((c, i) =>
                `${c} mag${(mg[i] / (c || 1)).toFixed(2)} nivel${(tn[i] / (c || 1)).toFixed(2)}` +
                ` lum${(lm[i] / ln[i]).toFixed(1)}`).join(' | ') +
                ' · estilos: ' + [...estilosUsados].sort().join(' | ');
        }
    }
}

function regenerate() {
    initializeSystem();
}

function savePNG() {
    saveCanvas(`002-glossa-seed${params.seed}`, 'png');
}

function keyPressed(e) {
    if (e && e.target && e.target.matches && e.target.matches('input, textarea')) return;
    if (key === 's' || key === 'S') savePNG();
    else if (key === 'r' || key === 'R') randomSeedAndUpdate();
    else if (key === ' ') { regenerate(); return false; }
}

// ── Seed ───────────────────────────────────────────────────────────────────

function writeSeedToURL() {
    try {
        const url = new URL(location.href);
        url.searchParams.set('seed', params.seed);
        history.replaceState(null, '', url);
    } catch (err) { /* file:// em alguns navegadores */ }
}

function updateSeedDisplay() {
    document.getElementById('seed-input').value = params.seed;
    writeSeedToURL();
}

function updateSeed() {
    const newSeed = parseInt(document.getElementById('seed-input').value, 10);
    if (newSeed > 0) {
        params.seed = newSeed;
        updateSeedDisplay();
        initializeSystem();
    } else {
        updateSeedDisplay();
    }
}

function previousSeed() {
    params.seed = Math.max(1, params.seed - 1);
    updateSeedDisplay();
    initializeSystem();
}

function nextSeed() {
    params.seed = params.seed + 1;
    updateSeedDisplay();
    initializeSystem();
}

function randomSeedAndUpdate() {
    params.seed = Math.floor(Math.random() * 999999) + 1;
    updateSeedDisplay();
    initializeSystem();
}

function resetParameters() {
    const seed = params.seed;
    params = { ...defaultParams, seed };
    for (const k of PARAM_KEYS) {
        document.getElementById(k).value = params[k];
        document.getElementById(`${k}-value`).textContent = params[k];
    }
    initializeSystem();
}

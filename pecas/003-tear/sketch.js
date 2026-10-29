/* ══════════════════════════════════════════════════════════════════════════
   003 — Tear

   Um tecido de glifos de 6×6 pixels. A trama é feita de corridas horizontais
   (o fio passa por várias células antes de trocar de cor ou de ponto), com
   dois motivos que se repetem: o "pico" (dois triângulos que se encostam) e
   a "palavra" (uma corrida de glifos sobre um fundo só).

   Atravessando o tecido corre uma faixa lisa de blocos grandes — o lugar
   onde o tear trocou de lançadeira. A cada quadro as bordas da faixa
   esgarçam: células perto dela são re-sorteadas, metade puxando o ponto da
   faixa, metade o da trama, com probabilidade que cai com a distância.
   À direita, a ourela: uma coluna escura de pontos e uma régua de marcas.

   Tudo determinístico pela seed. A animação é guiada pelo número do quadro:
   o quadro N de uma seed é sempre o mesmo.

   URL:    index.html?seed=12345
           ?passos=N   avança N quadros de uma vez e para (captura)
           ?capture=1  pausa o loop e expõe window.step(n)
           ?solo=1     só o canvas na tela
           ?escala=K   pixels de tela por pixel de glifo (padrão: cabe na janela)
   Teclas: S salva PNG · R nova seed · Espaço pausa/continua
   ══════════════════════════════════════════════════════════════════════════ */

// ── Grade ──────────────────────────────────────────────────────────────────
const G = 6;                      // pixels de glifo por célula
const COLS = 96, ROWS = 90;       // células da obra inteira (≈ 1152×1080 em escala 2)
const MARGEM = 1;                 // células de fundo ao redor
const OURELA_W = 5;               // largura da coluna escura da ourela
const REGUA_W = 3;                // células à direita com as marcas
const TRAMA_X0 = MARGEM, TRAMA_X1 = COLS - REGUA_W - OURELA_W;   // [x0, x1)
const TRAMA_Y0 = MARGEM, TRAMA_Y1 = ROWS - MARGEM;
const W0 = COLS * G, H0 = ROWS * G;

// ── Paleta (medida no vídeo de referência, arredondada) ────────────────────
const PAL = {
    fundo: '#c5c8d0',
    preto: '#000000',
    grafite: '#505050',
    branco: '#ffffff',
    ambar: '#feb600',
    lilas: '#9a6cf0',
    nevoa: '#c5c8d0',
};
const COR = Object.keys(PAL);
const RGBA = COR.map(k => {
    const h = PAL[k];
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian ABGR
});
const C = Object.fromEntries(COR.map((k, i) => [k, i]));

// ── Glifos 6×6 ('1' = frente, '0' = fundo) ─────────────────────────────────
const GLIFOS_SRC = {
    cheio:    ['111111', '111111', '111111', '111111', '111111', '111111'],
    vazio:    ['000000', '000000', '000000', '000000', '000000', '000000'],
    ponto:    ['000000', '011000', '011000', '000000', '000000', '000000'],
    pontos:   ['000000', '010010', '000000', '000000', '010010', '000000'],
    xadrez:   ['110011', '110011', '001100', '001100', '110011', '110011'],
    ralo:     ['100100', '000000', '010010', '000000', '100100', '000000'],
    listra:   ['111111', '000000', '000000', '111111', '000000', '000000'],
    trama:    ['101010', '010101', '101010', '010101', '101010', '010101'],
    triE:     ['100000', '110000', '111000', '111100', '111110', '111111'],
    triD:     ['000001', '000011', '000111', '001111', '011111', '111111'],
    diag:     ['110000', '011000', '001100', '000110', '000011', '100001'],
    disco:    ['001100', '011110', '111111', '111111', '011110', '001100'],
    losango:  ['001100', '011110', '110011', '110011', '011110', '001100'],
    cruz:     ['001100', '001100', '111111', '111111', '001100', '001100'],
    xis:      ['100001', '010010', '001100', '001100', '010010', '100001'],
    oito:     ['011110', '010010', '011110', '010010', '011110', '000000'],
    estrela:  ['010100', '111110', '011100', '111110', '010100', '000000'],
    grade:    ['111111', '100100', '100100', '111111', '100100', '100100'],
    barra:    ['000000', '111110', '111110', '000000', '000000', '000000'],
    meio:     ['000000', '000000', '000000', '111111', '111111', '111111'],
    marca:    ['000000', '000000', '111100', '000000', '000000', '000000'],
};
const GNOMES = Object.keys(GLIFOS_SRC);
const GID = Object.fromEntries(GNOMES.map((n, i) => [n, i]));
const GLIFOS = GNOMES.map(n => {
    const m = new Uint8Array(G * G);
    GLIFOS_SRC[n].forEach((row, y) => [...row].forEach((ch, x) => { m[y * G + x] = ch === '1' ? 1 : 0; }));
    return m;
});

// ── PRNG ───────────────────────────────────────────────────────────────────
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hash2(a, b) {
    let h = Math.imul(a ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x632BE5AB, 0xC2B2AE35);
    h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D); h ^= h >>> 15;
    return h >>> 0;
}
const escolher = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
function pesado(rnd, tabela) {   // [[valor, peso], ...]
    let s = 0; for (const [, p] of tabela) s += p;
    let r = rnd() * s;
    for (const [v, p] of tabela) { if ((r -= p) <= 0) return v; }
    return tabela[tabela.length - 1][0];
}

// ── Estado ─────────────────────────────────────────────────────────────────
// Cada célula: glifo, cor de frente, cor de fundo. `base` é o tecido de
// origem; `atual` é o que está na tela; `sujo` marca o que redesenhar.
let seed = 1;
let quadro = 0;
let base, atual, sujo;
let faixa;               // { y0, y1, letreiro, blocos }
let buf, bufCtx, img, px32;
let escala = 2;
let pausado = false;

const N = COLS * ROWS;
const idx = (x, y) => y * COLS + x;

function novoTecido() {
    return { g: new Uint8Array(N), f: new Uint8Array(N), b: new Uint8Array(N) };
}
function por(t, i, g, f, b) { t.g[i] = g; t.f[i] = f; t.b[i] = b; }

// Pares de cor da trama: [frente, fundo, peso]
const PARES_TRAMA = [
    [[C.preto, C.branco], 10], [[C.branco, C.preto], 10],
    [[C.preto, C.ambar], 7], [[C.ambar, C.preto], 6],
    [[C.lilas, C.preto], 3], [[C.lilas, C.nevoa], 2], [[C.branco, C.lilas], 1],
    [[C.preto, C.grafite], 6], [[C.grafite, C.preto], 4],
    [[C.preto, C.nevoa], 6], [[C.branco, C.grafite], 3],
    [[C.ambar, C.grafite], 2], [[C.nevoa, C.preto], 3],
];
const GLIFOS_TRAMA = [
    ['cheio', 8], ['vazio', 4], ['pontos', 4], ['xadrez', 3], ['ralo', 3], ['trama', 2],
    ['disco', 3], ['losango', 2], ['cruz', 2], ['xis', 1], ['oito', 3], ['estrela', 3],
    ['barra', 4], ['meio', 3], ['diag', 2], ['grade', 1], ['ponto', 2],
];

// Uma corrida da trama, escrita a partir de (x, y) com até `max` células.
function corrida(rnd, t, x, y, max) {
    const tipo = pesado(rnd, [['liso', 12], ['pico', 1.6], ['palavra', 2]]);
    if (tipo === 'pico' && max >= 2) {
        const [f, b] = pesado(rnd, [[[C.lilas, C.preto], 3], [[C.lilas, C.nevoa], 2], [[C.preto, C.branco], 3], [[C.grafite, C.nevoa], 2], [[C.ambar, C.preto], 1]]);
        const n = Math.min(max - (max % 2), 2 * (1 + Math.floor(rnd() * 3)));
        for (let k = 0; k < n; k++) por(t, idx(x + k, y), k % 2 ? GID.triD : GID.triE, f, b);
        return n;
    }
    if (tipo === 'palavra' && max >= 3) {
        const b = pesado(rnd, [[C.ambar, 5], [C.preto, 2], [C.branco, 1]]);
        const f = b === C.preto ? C.branco : C.preto;
        const n = Math.min(max, 3 + Math.floor(rnd() * 4));
        for (let k = 0; k < n; k++) por(t, idx(x + k, y), escolher(rnd, [GID.oito, GID.estrela, GID.xis, GID.oito, GID.cruz]), f, b);
        return n;
    }
    const [f, b] = pesado(rnd, PARES_TRAMA);
    const g = GID[pesado(rnd, GLIFOS_TRAMA)];
    // corridas curtas dominam, algumas longas costuram a linha
    const n = Math.min(max, 1 + Math.floor(-Math.log(1 - rnd()) * 1.8));
    for (let k = 0; k < n; k++) por(t, idx(x + k, y), g, f, b);
    return n;
}

function gerarFaixa(rnd) {
    const altura = 7 + Math.floor(rnd() * 5);
    const y0 = Math.floor(TRAMA_Y0 + (TRAMA_Y1 - TRAMA_Y0) * (0.32 + rnd() * 0.22));
    const blocos = [];
    const ESTILOS = [
        { g: 'pontos', f: C.preto, b: C.grafite, p: 6 },
        { g: 'cheio', f: C.grafite, b: C.grafite, p: 3 },
        { g: 'listra', f: C.grafite, b: C.nevoa, p: 4 },
        { g: 'xadrez', f: C.grafite, b: C.nevoa, p: 2 },
        { g: 'ponto', f: C.preto, b: C.ambar, p: 2 },
        { g: 'triE', f: C.preto, b: C.nevoa, p: 2 },
        { g: 'trama', f: C.preto, b: C.grafite, p: 1 },
        { g: 'grade', f: C.preto, b: C.nevoa, p: 1 },
    ];
    let x = TRAMA_X0;
    let ambarUsado = false;
    while (x < TRAMA_X1) {
        const w = Math.min(TRAMA_X1 - x, 4 + Math.floor(rnd() * 9));
        let topo = pesado(rnd, ESTILOS.map(e => [e, e.p]));
        if (topo.b === C.ambar) { if (ambarUsado) topo = ESTILOS[0]; ambarUsado = true; }
        // metade dos blocos se divide em cima/embaixo
        const corte = rnd() < 0.5 ? Math.floor(altura * (0.3 + rnd() * 0.3)) : altura;
        const baixo = corte < altura ? pesado(rnd, ESTILOS.filter(e => e.b !== C.ambar).map(e => [e, e.p])) : topo;
        blocos.push({ x0: x, x1: x + w, topo, baixo, corte });
        x += w;
    }
    return { y0, y1: y0 + altura, letreiro: y0 - 1, blocos };
}

function blocoEm(x) {
    for (const bl of faixa.blocos) if (x >= bl.x0 && x < bl.x1) return bl;
    return faixa.blocos[faixa.blocos.length - 1];
}
// O ponto da faixa numa célula (x, y) qualquer — usado também ao esgarçar.
function pontoDaFaixa(x, y) {
    const bl = blocoEm(Math.max(TRAMA_X0, Math.min(TRAMA_X1 - 1, x)));
    const dy = Math.max(0, Math.min(faixa.y1 - faixa.y0 - 1, y - faixa.y0));
    const e = dy < bl.corte ? bl.topo : bl.baixo;
    return [GID[e.g], e.f, e.b];
}

function gerar() {
    const rnd = mulberry32(hash2(seed, 0xA11CE));
    base = novoTecido();
    faixa = gerarFaixa(rnd);

    // fundo
    for (let i = 0; i < N; i++) por(base, i, GID.vazio, C.fundo, C.fundo);

    // trama
    for (let y = TRAMA_Y0; y < TRAMA_Y1; y++) {
        let x = TRAMA_X0;
        while (x < TRAMA_X1) x += corrida(rnd, base, x, y, TRAMA_X1 - x);
    }

    // faixa
    for (let y = faixa.y0; y < faixa.y1; y++)
        for (let x = TRAMA_X0; x < TRAMA_X1; x++) {
            const [g, f, b] = pontoDaFaixa(x, y);
            por(base, idx(x, y), g, f, b);
        }
    // letreiro: uma linha de glifos brancos sobre preto colada na faixa
    for (let x = TRAMA_X0; x < TRAMA_X1; x++) {
        const vivo = rnd() < 0.7;
        por(base, idx(x, faixa.letreiro),
            vivo ? escolher(rnd, [GID.oito, GID.estrela, GID.barra, GID.xis, GID.vazio]) : GID.vazio,
            C.branco, vivo ? C.preto : C.grafite);
    }

    // ourela: coluna escura de pontos, a faixa a atravessa
    for (let y = TRAMA_Y0; y < TRAMA_Y1; y++)
        for (let x = TRAMA_X1; x < TRAMA_X1 + OURELA_W; x++)
            por(base, idx(x, y), GID.pontos, C.preto, C.grafite);
    // régua: uma marca por célula, mais longa a cada cinco
    for (let y = TRAMA_Y0; y < TRAMA_Y1; y++)
        por(base, idx(TRAMA_X1 + OURELA_W, y), GID.marca, C.preto, C.fundo);

    atual = novoTecido();
    atual.g.set(base.g); atual.f.set(base.f); atual.b.set(base.b);
    sujo = new Uint8Array(N).fill(1);
    quadro = 0;
}

// ── Um quadro de tear ──────────────────────────────────────────────────────
function passo() {
    quadro++;
    const rnd = mulberry32(hash2(seed, quadro));

    // 1. bordas da faixa esgarçam (o letreiro faz parte da borda de cima)
    const ALCANCE = 5;
    for (let d = 0; d < ALCANCE; d++) {
        const p = 0.22 * Math.exp(-d * 0.75);
        for (const y of [faixa.letreiro - 1 - d, faixa.y1 + d, faixa.letreiro, faixa.y0]) {
            if (y < TRAMA_Y0 || y >= TRAMA_Y1) continue;
            const pp = (y === faixa.letreiro || y === faixa.y0) ? p * 0.5 : p;
            for (let x = TRAMA_X0; x < TRAMA_X1; x++) {
                if (rnd() > pp) continue;
                const i = idx(x, y);
                const r = rnd();
                if (r < 0.35) {
                    // puxa o ponto da faixa para fora
                    const [g, f, b] = pontoDaFaixa(x, y);
                    por(atual, i, g, f, b);
                } else if (r < 0.7) {
                    // puxa uma célula vizinha da trama de lado (fio arrastado)
                    const j = idx(Math.max(TRAMA_X0, Math.min(TRAMA_X1 - 1, x + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)))), y);
                    por(atual, i, atual.g[j], atual.f[j], atual.b[j]);
                } else if (r < 0.85) {
                    // um ponto solto da trama
                    corrida(rnd, atual, x, y, 1);
                } else {
                    // volta ao tecido original
                    por(atual, i, base.g[i], base.f[i], base.b[i]);
                }
                sujo[i] = 1;
            }
        }
    }

    // 2. a trama inteira respira: trechos curtos deslizam uma célula
    const DESLIZES = 10;
    for (let k = 0; k < DESLIZES; k++) {
        const y = TRAMA_Y0 + Math.floor(rnd() * (TRAMA_Y1 - TRAMA_Y0));
        if (y >= faixa.letreiro && y < faixa.y1) continue;
        const n = 2 + Math.floor(rnd() * 6);
        const x0 = TRAMA_X0 + Math.floor(rnd() * (TRAMA_X1 - TRAMA_X0 - n));
        const dir = rnd() < 0.5 ? -1 : 1;
        if (dir > 0) for (let x = x0 + n - 1; x > x0; x--) copiar(idx(x, y), idx(x - 1, y));
        else for (let x = x0; x < x0 + n - 1; x++) copiar(idx(x, y), idx(x + 1, y));
    }

    // 3. memória do tecido: células alteradas voltam devagar à origem
    const VOLTAS = 220;
    for (let k = 0; k < VOLTAS; k++) {
        const x = TRAMA_X0 + Math.floor(rnd() * (TRAMA_X1 - TRAMA_X0));
        const y = TRAMA_Y0 + Math.floor(rnd() * (TRAMA_Y1 - TRAMA_Y0));
        const i = idx(x, y);
        if (atual.g[i] !== base.g[i] || atual.f[i] !== base.f[i] || atual.b[i] !== base.b[i]) {
            por(atual, i, base.g[i], base.f[i], base.b[i]);
            sujo[i] = 1;
        }
    }

    // 4. a ourela rói o canto de baixo: a trama vaza para dentro dela
    for (let y = TRAMA_Y1 - 8; y < TRAMA_Y1; y++) {
        const fundo = (y - (TRAMA_Y1 - 8)) / 8;
        for (let x = TRAMA_X1; x < TRAMA_X1 + OURELA_W; x++) {
            if (rnd() > 0.04 * fundo * (1 - (x - TRAMA_X1) / OURELA_W)) continue;
            const i = idx(x, y);
            if (rnd() < 0.6) corrida(rnd, atual, x, y, 1);
            else por(atual, i, base.g[i], base.f[i], base.b[i]);
            sujo[i] = 1;
        }
    }
}

function copiar(i, j) {
    if (atual.g[i] === atual.g[j] && atual.f[i] === atual.f[j] && atual.b[i] === atual.b[j]) return;
    por(atual, i, atual.g[j], atual.f[j], atual.b[j]);
    sujo[i] = 1;
}

// ── Pintura: grade de baixa resolução → canvas ampliado sem suavizar ───────
function pintar() {
    for (let i = 0; i < N; i++) {
        if (!sujo[i]) continue;
        sujo[i] = 0;
        const cx = (i % COLS) * G, cy = Math.floor(i / COLS) * G;
        const m = GLIFOS[atual.g[i]], f = RGBA[atual.f[i]], b = RGBA[atual.b[i]];
        for (let y = 0; y < G; y++) {
            const o = (cy + y) * W0 + cx;
            for (let x = 0; x < G; x++) px32[o + x] = m[y * G + x] ? f : b;
        }
    }
    bufCtx.putImageData(img, 0, 0);
    const ctx = drawingContext;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W0 * escala, H0 * escala);
}

// ── p5 ─────────────────────────────────────────────────────────────────────
const Q = new URLSearchParams(location.search);
const SOLO = Q.get('solo') === '1';
const CAPTURA = Q.get('capture') === '1';
const PASSOS = Q.has('passos') ? Math.max(0, parseInt(Q.get('passos'), 10) || 0) : null;

function escalaInicial() {
    if (Q.has('escala')) return Math.max(1, parseInt(Q.get('escala'), 10) || 1);
    return 2;
}

function lerSeed() {
    const s = parseInt(Q.get('seed'), 10);
    if (Number.isFinite(s)) return s;
    const nova = Math.floor(Math.random() * 99999) + 1;   // só para escolher a seed, nunca no desenho
    gravarSeed(nova);
    return nova;
}
function gravarSeed(s) {
    const u = new URL(location.href);
    u.searchParams.set('seed', s);
    history.replaceState(null, '', u);
    const el = document.getElementById('seed-input');
    if (el) el.value = s;
}

function setup() {
    pixelDensity(1);
    escala = escalaInicial();
    const cnv = createCanvas(W0 * escala, H0 * escala);
    const alvo = document.getElementById('canvas-container');
    if (alvo) { alvo.innerHTML = ''; cnv.parent(alvo); }
    if (SOLO) document.body.classList.add('solo');

    buf = document.createElement('canvas');
    buf.width = W0; buf.height = H0;
    bufCtx = buf.getContext('2d');
    img = bufCtx.createImageData(W0, H0);
    px32 = new Uint32Array(img.data.buffer);

    seed = lerSeed();
    gravarSeed(seed);
    reiniciar();

    if (PASSOS !== null) {
        for (let k = 0; k < PASSOS; k++) passo();
        pintar();
        noLoop();
    } else if (CAPTURA) {
        pintar();
        noLoop();
    }
    frameRate(30);
}

function draw() {
    if (!pausado) passo();
    pintar();
    atualizarStatus();
}

function reiniciar() {
    gerar();
    if (buf) pintar();
    atualizarStatus();
}

function atualizarStatus() {
    const el = document.getElementById('status');
    if (el) el.textContent = `seed ${seed} · quadro ${quadro}${pausado ? ' · pausado' : ''}`;
}

window.step = function (n = 1) {
    for (let k = 0; k < n; k++) passo();
    pintar();
    atualizarStatus();
    return quadro;
};

// ── Controles ──────────────────────────────────────────────────────────────
function definirSeed(s) {
    seed = Math.max(1, Math.floor(s));
    gravarSeed(seed);
    reiniciar();
}
function updateSeed() { definirSeed(parseInt(document.getElementById('seed-input').value, 10) || 1); }
function previousSeed() { definirSeed(seed - 1); }
function nextSeed() { definirSeed(seed + 1); }
function randomSeedAndUpdate() { definirSeed(Math.floor(Math.random() * 99999) + 1); }
function alternarPausa() { pausado = !pausado; atualizarStatus(); }
function savePNG() { saveCanvas(`003-tear_seed-${seed}`, 'png'); }

function keyPressed() {
    const t = document.activeElement && document.activeElement.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (key === 's' || key === 'S') savePNG();
    else if (key === 'r' || key === 'R') randomSeedAndUpdate();
    else if (key === ' ') { alternarPausa(); return false; }
}

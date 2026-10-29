#!/usr/bin/env python3
"""
analisar_gif.py — lê um GIF, dá zoom até o pixel virar bloco, e extrai dele
uma *gramática* de cor, padrão e movimento que outra arte generativa consome.

O GIF é analisado como um sistema, não como uma imagem:
  1. ZOOM      — média por bloco: a tela vira uma grade de células de cor.
  2. COR       — quantização (k-means) das células acesas -> paleta.
  3. PADRÃO    — tensor de estrutura na imagem média: para cada célula, a
                 direção dominante dos fios e quão direcional ela é
                 (coerência). É o "desenho" do movimento congelado.
  4. MOVIMENTO — o GIF não transla (o deslocamento global é 0): ele acumula
                 luz. Então o movimento medido é o da luz:
                   · velocidade = d(luminância)/dt, por ajuste linear em t;
                   · direção    = -grad(L), para onde a luz avança no escuro.
  5. REGRAS    — cor -> movimento, e velocidade -> cor. É a tradução que a
                 peça nova usa: uma cor puxa um movimento, uma velocidade
                 de movimento vira uma cor.

Saída: JSON com a paleta, as regras e os histogramas; PNGs para inspeção.

Uso:
  python3 ferramentas/analisar_gif.py <gif> [--bloco 8] [--cores 6] [--saida dados.json]
  (rodar com um venv que tenha pillow + numpy)
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image


# ---------------------------------------------------------------- leitura

def ler_frames(caminho):
    im = Image.open(caminho)
    frames = []
    try:
        while True:
            frames.append(np.asarray(im.convert("RGB"), dtype=np.float32))
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    if not frames:
        sys.exit(f"nenhum quadro em {caminho}")
    return np.stack(frames)


def gauss(a, sigma=1.5):
    """Suavização separável (elimina o grão antes de medir direções)."""
    k = int(3 * sigma)
    x = np.arange(-k, k + 1)
    w = np.exp(-x ** 2 / (2 * sigma ** 2))
    w /= w.sum()
    a = np.apply_along_axis(lambda m: np.convolve(m, w, mode="same"), 0, a)
    return np.apply_along_axis(lambda m: np.convolve(m, w, mode="same"), 1, a)


# ------------------------------------------------------------- movimento

def crescimento_luz(L):
    """d(luminância)/quadro por pixel — ajuste linear de L(t). (H,W)"""
    T = L.shape[0]
    t = np.arange(T, dtype=np.float32)
    tc = t - t.mean()
    return (L * tc[:, None, None]).sum(0) / (tc ** 2).sum()


def tensor_estrutura(img, sigma=1.5, sigma2=2.0):
    """Direção dos fios e coerência, por pixel.

    J = [Jxx Jxy; Jxy Jyy] dos gradientes suavizados.
      ângulo do fio = ½·atan2(2Jxy, Jxx−Jyy) + 90°  (perpendicular ao gradiente)
      coerência      = ((λ1−λ2)/(λ1+λ2))²  ∈ [0,1]  (0 = textura s/ direção)
    """
    S = gauss(img, sigma)
    gy, gx = np.gradient(S)
    Jxx = gauss(gx * gx, sigma2)
    Jyy = gauss(gy * gy, sigma2)
    Jxy = gauss(gx * gy, sigma2)
    fio = (0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2) % np.pi
    raiz = np.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy ** 2)
    l1 = (Jxx + Jyy + raiz) / 2
    l2 = (Jxx + Jyy - raiz) / 2
    coer = ((l1 - l2) / (l1 + l2 + 1e-9)) ** 2
    return fio, coer


def direcao_avanco(img, sigma=3.0):
    """Para onde a luz caminha: -grad(L) normalizado (do claro para o escuro).

    Retorna (ux, uy) unitários e a magnitude |grad| (onde o degradê é forte).
    """
    gy, gx = np.gradient(gauss(img, sigma))
    mod = np.hypot(gx, gy) + 1e-9
    return -gx / mod, -gy / mod, mod


# ---------------------------------------------------------------- células

def celula(a, op="media"):
    """Média por bloco nos eixos espaciais (H,W).

    (H,W)      -> (gh,gw)
    (H,W,C)    -> (gh,gw,C)
    (T,H,W,C)  -> (T,gh,gw,C)
    """
    if a.ndim == 2:
        h, w = a.shape
        a = a[: h // BLOCO * BLOCO, : w // BLOCO * BLOCO]
        b = a.reshape(h // BLOCO, BLOCO, w // BLOCO, BLOCO)
        eixos = (1, 3)
    elif a.ndim == 3:
        c, h, w = a.shape
        a = a[:, : h // BLOCO * BLOCO, : w // BLOCO * BLOCO]
        b = a.reshape(c, h // BLOCO, BLOCO, w // BLOCO, BLOCO)
        eixos = (2, 4)
    elif a.ndim == 4:
        t, h, w, c = a.shape
        a = a[:, : h // BLOCO * BLOCO, : w // BLOCO * BLOCO]
        b = a.reshape(t, h // BLOCO, BLOCO, w // BLOCO, BLOCO, c)
        eixos = (2, 4)
    else:
        raise ValueError(f"dimensão não suportada: {a.ndim}")
    if op == "media":
        return b.mean(axis=eixos)
    if op == "soma":
        return b.sum(axis=eixos)
    raise ValueError(op)


BLOCO = 8


# --------------------------------------------------------------- paleta

def kmeans(X, k, iteracoes=30, seed=0):
    rng = np.random.default_rng(seed)
    cent = X[rng.choice(len(X), k, replace=False)].copy()
    for _ in range(iteracoes):
        lab = ((X[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
        for j in range(k):
            if (lab == j).any():
                cent[j] = X[lab == j].mean(0)
    lab = ((X[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
    return cent, lab


def hexcor(c):
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in c)


def rgb_para_hsv(c):
    r, g, b = [v / 255 for v in c]
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == r:
        h = (60 * ((g - b) / d) + 360) % 360
    elif mx == g:
        h = 60 * ((b - r) / d) + 120
    else:
        h = 60 * ((r - g) / d) + 240
    s = 0.0 if mx == 0 else d / mx
    return h, s, mx


def nome_cor(c):
    """Nome grosseiro em português, só para leitura humana no JSON."""
    h, s, v = rgb_para_hsv(c)
    if v < 0.10:
        return "breu"
    if s < 0.18:
        return "branco" if v > 0.6 else ("cinza" if v > 0.25 else "carvao")
    if h < 20 or h >= 340:
        return "vermelho"
    if h < 45:
        return "ambar"
    if h < 70:
        return "ouro"
    if h < 160:
        return "verde"
    if h < 200:
        return "ciano"
    if h < 255:
        return "azul"
    if h < 290:
        return "violeta"
    return "magenta"


def angulo_medio(graus):
    """Média circular de ângulos em [0,180) — vira 0..180."""
    r = np.radians(np.asarray(graus, dtype=np.float64))
    return float(np.degrees(0.5 * np.arctan2(np.sin(2 * r).mean(),
                                             np.cos(2 * r).mean()))) % 180


# ------------------------------------------------------- mapas de inspeção

def salvar_mapa(matriz, caminho, escala=10):
    """(gh,gw) -> PNG ampliado, escala preto→azul→ciano→âmbar→branco."""
    m = np.asarray(matriz, dtype=np.float32)
    finito = np.isfinite(m)
    if finito.any():
        lo, hi = np.percentile(m[finito], 2), np.percentile(m[finito], 98)
        norm = np.clip((m - lo) / (hi - lo + 1e-9), 0, 1)
    else:
        norm = np.zeros_like(m)
    stops = np.array([[0, 0, 0], [10, 40, 80], [40, 160, 170],
                      [224, 164, 88], [255, 250, 240]], dtype=np.float32) / 255
    pos = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(norm, pos, stops[:, i]) for i in range(3)], axis=2)
    rgb[~finito] = [0.12, 0.12, 0.13]
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    img = img.resize((img.width * escala, img.height * escala), Image.NEAREST)
    img.save(caminho)


# ------------------------------------------------------------------ main

def main():
    global BLOCO
    ap = argparse.ArgumentParser()
    ap.add_argument("gif")
    ap.add_argument("--bloco", type=int, default=8, help="px por célula do zoom")
    ap.add_argument("--cores", type=int, default=6)
    ap.add_argument("--limiar-luz", type=float, default=12.0)
    ap.add_argument("--saida", default=None)
    ap.add_argument("--js", default=None,
                    help="grava também um .js com window.GRAMATICA = {...} "
                         "(para a peça abrir direto em file://, sem fetch)")
    ap.add_argument("--pasta-saidas", default=None)
    a = ap.parse_args()
    BLOCO = a.bloco

    base = a.saida or (os.path.splitext(a.gif)[0] + "-dados.json")
    pasta_png = a.pasta_saidas or os.path.dirname(os.path.abspath(base)) or "."
    os.makedirs(pasta_png, exist_ok=True)
    nome = os.path.splitext(os.path.basename(a.gif))[0]

    F = ler_frames(a.gif)
    T, H, W, _ = F.shape
    b = a.bloco
    print(f"{os.path.basename(a.gif)}: {W}x{H}, {T} quadros, bloco {b}px")

    gh, gw = H // b, W // b
    print(f"grade: {gw} x {gh} células = {gw * gh} pixels lidos")

    # ---------------------------------------------- medidas por pixel
    L = F.mean(3)                                  # (T,H,W)
    media = L.mean(0)                              # imagem média
    dL_px = crescimento_luz(L)                     # (H,W)
    fio_px, coer_px = tensor_estrutura(media)
    avx_px, avy_px, mod_px = direcao_avanco(media)
    acesa_px = media > a.limiar_luz

    # ---------------------------------------------- passagem para células
    # ângulos: média circular dentro da célula
    def cel_angulo(f):
        s = np.sin(2 * f)
        c = np.cos(2 * f)
        return np.degrees(0.5 * np.arctan2(celula(s), celula(c))) % 180

    dL = celula(dL_px)                             # velocidade da luz
    coer = celula(coer_px)
    fio = cel_angulo(fio_px)
    forca = celula(mod_px)
    avx = celula(avx_px * mod_px) / (forca + 1e-9)
    avy = celula(avy_px * mod_px) / (forca + 1e-9)
    cores = celula(F).mean(0)                      # (gh,gw,3) cor média no tempo
    flat = cores.reshape(-1, 3)
    acesas = flat.mean(1) > a.limiar_luz           # célula acesa (para regiões/movimento)

    # ---------------------------------------------- paleta
    # A cor de cada célula NÃO é a média do bloco: média de 8×8 dilui o fio
    # fino dentro do fundo e a paleta vira cinza. É a média dos 4 pixels mais
    # claros do bloco (a "cor de fio"), e o pool é estratificado por
    # luminância para os brilhos raros não sumirem no k-means.
    ultimo = F[-1]
    luma = ultimo.mean(2)
    lc = luma[: gh * b, : gw * b].reshape(gh, b, gw, b).reshape(gh, gw, b * b)
    top = np.argpartition(lc, -4, axis=2)[:, :, -4:]       # 4 mais claros
    ys = np.arange(gh)[:, None, None] * b + (top // b)
    xs = np.arange(gw)[None, :, None] * b + (top % b)
    cores_fio = ultimo[ys, xs].mean(2)                    # (gh,gw,3)

    m_acesas = acesas.reshape(gh, gw)
    vals = cores_fio[m_acesas].mean(1)
    bordas = np.linspace(vals.min(), vals.max(), 9)
    escolhidos, rng = [], np.random.default_rng(0)
    for i in range(8):
        faixa = np.where((vals >= bordas[i]) &
                         (vals < bordas[i + 1] if i < 7 else True))[0]
        if len(faixa):
            escolhidos.append(rng.choice(faixa, min(4000, len(faixa)), replace=False))
    X = cores_fio[m_acesas][np.concatenate(escolhidos)]

    print(f"pool da paleta: {len(X)} células de {int(m_acesas.sum())} acesas "
          f"(cor de fio, estratificada em 8 faixas de luminância)")
    cent, lab = kmeans(X, a.cores, seed=0)
    cent = cent[np.argsort(cent.mean(1))]          # do mais escuro ao mais claro
    # atribuição das CÉLULAS à paleta (o k-means saiu da cor de fio; regiões e
    # movimento são medidos por célula, então cada célula vira a cor mais próxima)
    Xcel = cores_fio[m_acesas]
    lab_cel = ((Xcel[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
    yy, xx = np.where(m_acesas)
    print(f"células acesas: {len(Xcel)}/{gh * gw} ({len(Xcel)/(gh*gw)*100:.1f}%) · "
          f"{len(cent)} cores na paleta")

    # ---------------------------------------------- cor -> movimento
    paleta = []
    for j, c in enumerate(cent):
        s = lab_cel == j
        yj, xj = yy[s], xx[s]
        if len(yj) == 0:
            continue
        h, sat, val = rgb_para_hsv(c)
        v_luz = float(dL[yj, xj].mean())
        v_todas = float(dL[acesas.reshape(gh, gw)].mean())
        paleta.append({
            "hex": hexcor(c),
            "nome": nome_cor(c),
            "share": round(float(s.mean()), 4),
            "luminancia": round(float(c.mean()), 1),
            "matiz_graus": round(float(h), 1),
            "saturacao": round(float(sat), 3),
            "brilho": round(float(val), 3),
            "regioes": {
                "topo": round(float((yj < gh / 3).mean()), 3),
                "meio": round(float(((yj >= gh / 3) & (yj < 2 * gh / 3)).mean()), 3),
                "base": round(float((yj >= 2 * gh / 3).mean()), 3),
                "esquerda": round(float((xj < gw / 3).mean()), 3),
                "centro": round(float(((xj >= gw / 3) & (xj < 2 * gw / 3)).mean()), 3),
                "direita": round(float((xj >= 2 * gw / 3).mean()), 3),
            },
            "padrao": {
                "angulo_fio_graus": round(float(angulo_medio(fio[yj, xj])), 1),
                "dispersao_angulo": round(float(np.abs(
                    (fio[yj, xj] - angulo_medio(fio[yj, xj]) + 90) % 180 - 90).mean()), 1),
                "coerencia": round(float(coer[yj, xj].mean()), 3),
            },
            "movimento": {
                "velocidade_luz": round(v_luz, 3),          # lum/quadro
                "rapidez_relativa": round(v_luz / (v_todas + 1e-9), 3),
                "angulo_avanco_graus": round(float(np.degrees(
                    np.arctan2(avy[yj, xj].mean(), avx[yj, xj].mean()))), 1),
                "forca_degradue": round(float(forca[yj, xj].mean()), 3),
                "amostras": int(s.sum()),
            },
        })
        m, p = paleta[-1]["movimento"], paleta[-1]["padrao"]
        print(f"  {paleta[-1]['hex']} {paleta[-1]['nome']:8} {paleta[-1]['share']*100:5.1f}%  "
              f"luz={m['velocidade_luz']:.2f} (x{m['rapidez_relativa']:.2f})  "
              f"fio={p['angulo_fio_graus']:5.1f}°  coer={p['coerencia']:.2f}  "
              f"avanço={m['angulo_avanco_graus']:6.1f}°")

    # ---------------------------------------------- velocidade -> cor
    limites = [0.0, 0.15, 0.35, 0.7, 1.5, 1e9]
    rotulos = ["parado", "lento", "medio", "rapido", "instantaneo"]
    vel_cor = []
    m_acesas = acesas.reshape(gh, gw)
    for i in range(len(limites) - 1):
        sel = (dL >= limites[i]) & (dL < limites[i + 1]) & m_acesas
        n = int(sel.sum())
        reg = {
            "faixa": rotulos[i],
            "limite_lum_quadro": [limites[i],
                                  None if limites[i + 1] > 1e8 else limites[i + 1]],
            "amostras": n,
        }
        if n >= 15:
            cm = cores[sel].mean(0)
            hh, ss, vv = rgb_para_hsv(cm)
            reg.update({
                "cor_media": hexcor(cm),
                "matiz_graus": round(float(hh), 1),
                "saturacao": round(float(ss), 3),
                "luminancia": round(float(cm.mean()), 1),
                "angulo_fio_graus": round(float(angulo_medio(fio[sel])), 1),
                "cor_paleta": min(paleta, key=lambda p: abs(p["luminancia"] - cm.mean()))["hex"],
            })
        vel_cor.append(reg)
        print(f"  {rotulos[i]:11} n={n:5d} -> {reg.get('cor_media', '—')}  "
              f"lum={reg.get('luminancia', '—')}")

    # ---------------------------------------------- gramática legível
    gramatica = {
        "cor_para_movimento": [
            {"cor": p["hex"], "nome": p["nome"],
             "regra": (f"{p['nome']} ({p['hex']}) corre a {p['movimento']['velocidade_luz']:.2f} "
                       f"de luz/quadro — {p['movimento']['rapidez_relativa']:.2f}× a média — "
                       f"na direção dos fios de {p['padrao']['angulo_fio_graus']:.0f}°, "
                       f"avançando para {p['movimento']['angulo_avanco_graus']:.0f}°, "
                       f"com coerência {p['padrao']['coerencia']:.2f}.")}
            for p in paleta
        ],
        "velocidade_para_cor": [
            {"faixa": r["faixa"],
             "regra": (f"quem se move {r['faixa']} ({r['limite_lum_quadro']} de luz/quadro) "
                       f"vira {r.get('cor_media', 'indeterminado')}"
                       + (f", que na paleta é {r['cor_paleta']}" if r.get("cor_paleta") else ""))}
            for r in vel_cor if r.get("cor_media")
        ],
    }

    # ---------------------------------------------- histogramas e global
    v_ok = dL[m_acesas]
    ang_peso = (coer_px * acesa_px).ravel()
    h_ang, e_ang = np.histogram(np.degrees(fio_px).ravel() % 180, bins=12,
                                range=(0, 180), weights=ang_peso)
    h_vel, e_vel = np.histogram(v_ok, bins=12, range=(0, float(np.percentile(v_ok, 99))))
    freq = celula((L > a.limiar_luz).astype(np.float32)).mean(0)   # (gh,gw)

    dados = {
        "fonte": os.path.relpath(a.gif, os.path.dirname(os.path.abspath(base)) or "."),
        "quadros": T,
        "resolucao": [W, H],
        "bloco_px": b,
        "grade": [gw, gh],
        "parametros": {"cores": a.cores, "limiar_luz": a.limiar_luz,
                       "sigma_suavizacao": 1.5, "sigma_avanco": 3.0},
        "paleta": paleta,
        "velocidade_por_cor": vel_cor,
        "gramatica": gramatica,
        "movimento_global": {
            "luz_media_por_quadro": round(float(v_ok.mean()), 3),
            "luz_mediana_por_quadro": round(float(np.median(v_ok)), 3),
            "luz_p90_por_quadro": round(float(np.percentile(v_ok, 90)), 3),
            "angulo_fio_dominante_graus": round(
                angulo_medio(np.degrees(fio_px)[acesa_px]), 1),
            "coerencia_media": round(float(coer_px[acesa_px].mean()), 3),
            "deslocamento_global": [0, 0],
        },
        "histograma": {
            "angulo_fio": {"limites": [round(float(x), 1) for x in e_ang],
                           "contagens": h_ang.astype(int).tolist()},
            "velocidade_luz": {"limites": [round(float(x), 3) for x in e_vel],
                               "contagens": h_vel.astype(int).tolist()},
        },
        "persistencia": {
            "celulas_sempre_escuras": round(float((freq == 0).mean()), 3),
            "celulas_sempre_acesas": round(float((freq > 0.9).mean()), 3),
            "crescimento_linha_reta": round(float(
                np.polyfit(np.arange(T), L.reshape(T, -1).mean(1), 1)[0]), 4),
        },
    }

    with open(base, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
    print(f"JSON -> {base}")

    if a.js:
        with open(a.js, "w", encoding="utf-8") as f:
            f.write("/* Gerado por ferramentas/analisar_gif.py — NÃO editar na mão.\n"
                    f"   Fonte: {dados['fonte']} · {dados['quadros']} quadros · "
                    f"grade {dados['grade'][0]}x{dados['grade'][1]} · bloco {b}px */\n")
            f.write("window.GRAMATICA = ")
            json.dump(dados, f, ensure_ascii=False, indent=2)
            f.write(";\n")
        print(f"JS  -> {a.js}")

    # ---------------------------------------------- PNGs de inspeção
    Image.fromarray(celula(F).mean(0).astype(np.uint8)).resize((gw * 10, gh * 10), Image.NEAREST)\
        .save(os.path.join(pasta_png, f"{nome}-zoom.png"))
    ultimo = np.zeros((gh, gw, 3), dtype=np.float32)
    for g in celula(F):
        m = g.mean(2) > a.limiar_luz
        ultimo[m] = g[m]
    Image.fromarray(ultimo.astype(np.uint8)).resize((gw * 10, gh * 10), Image.NEAREST)\
        .save(os.path.join(pasta_png, f"{nome}-cores.png"))
    salvar_mapa(dL, os.path.join(pasta_png, f"{nome}-velocidade.png"))
    salvar_mapa(fio, os.path.join(pasta_png, f"{nome}-direcao.png"))
    salvar_mapa(coer, os.path.join(pasta_png, f"{nome}-coerencia.png"))
    print("PNGs de inspeção -> " + pasta_png)


if __name__ == "__main__":
    main()

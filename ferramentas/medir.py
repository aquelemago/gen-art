#!/usr/bin/env python3
"""medir.py — exposição e estrutura de um render, na escala da 001.

    ferramentas/medir.py renders/*.png

Compara cada PNG com a referência (001-correntes-seed90517.png) nos números
que decidem se a imagem está "no mesmo ar": percentis de luminância, média
RGB, saturação, fração de tela acima de 40 (a "base viva"), a divisão da
luz por terço vertical, a luz nas quinas (a 001 mantém valor até a borda),
o croma dos claros (a oposição quente-frio só existe onde o olho olha) e o
clipping. Serve para calibrar GANHO/CONTRASTE da 002 sem olhar a olho —
olho não enxerga 3× de diferença de exposição de uma vez.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REF = "renders/001-correntes-seed90517.png"


def stats(caminho):
    a = np.asarray(Image.open(caminho).convert("RGB")).astype(float)
    l = a.mean(2)
    h, w = l.shape
    croma = a.max(2) - a.min(2)
    claros = l > 60
    q = w // 6                      # caixa de quina: 1/6 da largura
    cantos = [l[:q, :q], l[:q, -q:], l[-q:, :q], l[-q:, -q:]]
    d = {
        "tam": f"{w}x{h}",
        "pct": {p: float(np.percentile(l, p)) for p in (10, 50, 75, 90, 99, 99.9)},
        "media": a.reshape(-1, 3).mean(0),
        "sat": float(croma.mean()),
        "croma_claros": float(croma[claros].mean()) if claros.any() else 0.0,
        "frac_claros": float(claros.mean() * 100),
        "acesos": float((l > 40).mean() * 100),
        "quinas": float(np.mean([c.mean() for c in cantos])),
        "quinas_min": float(min(c.mean() for c in cantos)),
        "clipping": float((a.max(2) >= 255).mean() * 100),
        "tercos": [(float(l[s].mean()), float((l[s] > 40).mean() * 100))
                   for s in (slice(0, h // 3), slice(h // 3, 2 * h // 3), slice(2 * h // 3, h))],
        "azuis": int(((a[..., 2] > a[..., 0] * 3) & (a[..., 2] > 40) & (a[..., 0] < 12)).sum()),
    }
    return d


def linha(nome, d):
    p = d["pct"]
    print(f"{nome}")
    print(f"   {d['tam']:>9}  lum p50={p[50]:6.1f} p90={p[90]:6.1f} p99={p[99]:6.1f}"
          f"  media={d['media'].round(1)}  sat={d['sat']:.1f}  >40={d['acesos']:5.1f}%"
          f"  azuis={d['azuis']}")
    print(f"   quinas {d['quinas']:5.1f} lum (pior {d['quinas_min']:5.1f})"
          f"  croma claros {d['croma_claros']:5.1f} em {d['frac_claros']:4.1f}% da tela"
          f"  clipping {d['clipping']:4.2f}%")
    print("   topo/meio/base: "
          + "  ".join(f"{m:5.1f} lum {a:4.1f}% >40" for m, a in d["tercos"]))


def main(argv):
    arqs = argv or [REF]
    ref = stats(REF) if Path(REF).exists() else None
    for f in arqs:
        if not Path(f).exists():
            print(f"{f}: não existe", file=sys.stderr)
            continue
        linha(Path(f).name, stats(f))
    if ref is not None and len(arqs) > 1:
        print("\nvs referência 001 (razão p50/p90/p99 e >40):")
        for f in arqs:
            if not Path(f).exists():
                continue
            d = stats(f)
            r = lambda k: (d["pct"][k] / ref["pct"][k]) if ref["pct"][k] else 0
            print(f"   {Path(f).name:<38} p50×{r(50):.2f}  p90×{r(90):.2f}"
                  f"  p99×{r(99):.2f}  >40×{d['acesos'] / ref['acesos']:.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])

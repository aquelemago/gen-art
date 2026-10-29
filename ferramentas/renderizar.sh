#!/usr/bin/env bash
# renderizar.sh — captura uma peça em PNG com o chromium headless.
#
#   ferramentas/renderizar.sh 002-glossa 42 [passos] [largura] [altura] [extra]
#
# Roda a peça com ?seed=S&passos=N&solo=1 (render síncrono e determinístico,
# só o canvas na tela) e grava renders/<peca>-seed<S>.png.
# [extra] vai para a URL, ex.: "ganho=2.5&tinta=0" — naí o PNG leva o sufixo
# do extra para não sobrescrever: renders/<peca>-seed<S>-ganho2.5-tinta0.png
# O caminho da peça precisa terminar em NNN-nome, ex.: 002-glossa.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PECA="${1:?uso: renderizar.sh <NNN-nome> <seed> [passos] [largura] [altura] [extra]}"
SEED="${2:?informe a seed}"
PASSOS="${3:-900}"
LARGURA="${4:-1080}"
ALTURA="${5:-1350}"
EXTRA="${6:-}"

DIR="$RAIZ/pecas/$PECA"
[ -f "$DIR/index.html" ] || { echo "não achei $DIR/index.html" >&2; exit 1; }

mkdir -p "$RAIZ/renders"
SUFIJO=""
if [ -n "$EXTRA" ]; then
    SUFIJO="-$(echo "$EXTRA" | tr '&=' '--' | tr -cd 'A-Za-z0-9._-')"
fi
SAIDA="$RAIZ/renders/${PECA}-seed${SEED}${SUFIJO}.png"
URL="file://$DIR/index.html?seed=${SEED}&passos=${PASSOS}&solo=1"
[ -n "$EXTRA" ] && URL="$URL&$EXTRA"

# perfil descartável: sem isso o chromium herda ~/.config/chromium e, se
# houver um navegador aberto, fica esperando o SingletonLock para sempre
PERFIL="$(mktemp -d)"
trap 'rm -rf "$PERFIL"' EXIT

timeout 240 chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --user-data-dir="$PERFIL" --no-first-run --disable-extensions \
    --window-size="$LARGURA","$ALTURA" --force-device-scale-factor=1 \
    --virtual-time-budget=20000 \
    --screenshot="$SAIDA" "$URL" >/dev/null 2>&1

[ -s "$SAIDA" ] || { echo "render falhou: $SAIDA vazio" >&2; exit 1; }

echo "$SAIDA"

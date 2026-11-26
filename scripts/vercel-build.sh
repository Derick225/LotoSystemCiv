#!/bin/sh
set -eu

# Recharger l'environnement Rust/WASM dans le shell du buildCommand Vercel
if [ -d /rust/bin ]; then
  export RUSTUP_HOME="${RUSTUP_HOME:-/rust}"
  if [ -w /rust ]; then
    export CARGO_HOME="${CARGO_HOME:-/rust}"
  fi
fi

if [ -f /rust/env ]; then
  # shellcheck source=/dev/null
  . /rust/env
elif [ -f /root/.cargo/env ]; then
  # shellcheck source=/dev/null
  . /root/.cargo/env
elif [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.cargo/env"
fi

export PATH="/rust/bin:${CARGO_HOME:-/root/.cargo}/bin:/root/.cargo/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH"

if ! command -v wasm-pack >/dev/null 2>&1; then
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown || true
fi

npm run build:wasm
npm run verify:wasm -- --strict

if [ ! -s public/loto_engine_bg.wasm ]; then
  echo "[VERCEL BUILD] ERREUR: public/loto_engine_bg.wasm absent ou vide après build:wasm" >&2
  exit 1
fi

npm run build

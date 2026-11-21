#!/bin/sh
set -eu

# Recharger l'environnement Rust/WASM dans le shell du buildCommand Vercel
if [ -f /rust/env ]; then
  # shellcheck source=/dev/null
  . /rust/env
elif [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.cargo/env"
fi

export PATH="/rust/bin:${CARGO_HOME:-$HOME/.cargo}/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH"

if ! command -v wasm-pack >/dev/null 2>&1; then
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown || true
fi

npm run build:wasm
npm run verify:wasm
npm run build

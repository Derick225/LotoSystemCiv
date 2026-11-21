#!/bin/sh
set -eu

# Charger l'environnement Rust pré-installé (Vercel utilise /rust) ou standard ($HOME/.cargo)
if [ -f /rust/env ]; then
  # shellcheck source=/dev/null
  . /rust/env
elif [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.cargo/env"
fi

export PATH="/rust/bin:${CARGO_HOME:-$HOME/.cargo}/bin:$HOME/.cargo/bin:/usr/local/bin:$PATH"

# Installer Rust uniquement s'il est absent
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  if [ -f /rust/env ]; then
    . /rust/env
  elif [ -f "$HOME/.cargo/env" ]; then
    . "$HOME/.cargo/env"
  fi
  export PATH="/rust/bin:$HOME/.cargo/bin:$PATH"
fi

# S'assurer que la cible WebAssembly est installée
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown || true
fi

# Installer wasm-pack uniquement s'il est absent
if ! command -v wasm-pack >/dev/null 2>&1; then
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Installer les dépendances Node
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

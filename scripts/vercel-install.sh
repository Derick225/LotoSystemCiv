#!/bin/sh
set -eu

# Résolution robuste des répertoires Rust/Cargo sur Vercel ($HOME=/vercel vs euid=/root et /rust)
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

# Installer Rust uniquement s'il est absent (sans erreur si déjà présent sous /rust)
if ! command -v cargo >/dev/null 2>&1; then
  RUSTUP_INIT_SKIP_PATH_CHECK=yes curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
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
  export PATH="/rust/bin:${CARGO_HOME:-/root/.cargo}/bin:/root/.cargo/bin:$HOME/.cargo/bin:$PATH"
fi

# S'assurer que la cible WebAssembly est installée
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown || true
fi

# Installer wasm-pack uniquement s'il est absent des emplacements connus
if ! command -v wasm-pack >/dev/null 2>&1; then
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[VERCEL INSTALL] ERREUR: wasm-pack introuvable après installation (PATH=$PATH)" >&2
  exit 1
fi

# Installer les dépendances Node
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

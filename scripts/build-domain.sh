#!/usr/bin/env sh
# Build the one domain runtime used by both Vite and Tauri.
set -eu
cd "$(dirname "$0")/.."
if ! command -v wasm-bindgen >/dev/null 2>&1; then
  echo 'Install wasm-bindgen-cli 0.2.114: cargo install wasm-bindgen-cli --version 0.2.114 --locked' >&2
  exit 1
fi
if [ "$(wasm-bindgen --version)" != 'wasm-bindgen 0.2.114' ]; then
  echo 'wasm-bindgen-cli must match the pinned Rust dependency: 0.2.114.' >&2
  exit 1
fi
cargo build --locked -p hyperforest-bridge --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/hyperforest_bridge.wasm \
  --target web --out-dir src/generated --out-name hyperforest_bridge

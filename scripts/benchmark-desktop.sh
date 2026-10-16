#!/usr/bin/env sh
# Build the optional harness, then run actual WebKit against disposable data.
set -eu
cd "$(dirname "$0")/.."
npm run desktop:build -- --no-bundle --features benchmark
benchmark_directory=$(mktemp -d /tmp/hyperforest-desktop-perf.XXXXXX)
printf 'Benchmark data and result: %s\n' "$benchmark_directory"
env HYPERFOREST_BENCHMARK_DIR="$benchmark_directory" \
  XDG_CONFIG_HOME="$benchmark_directory/config" \
  XDG_CACHE_HOME="$benchmark_directory/cache" \
  XDG_DATA_HOME="$benchmark_directory/data" \
  timeout 120 src-tauri/target/release/hyperforest-desktop
cat "$benchmark_directory/performance.json"

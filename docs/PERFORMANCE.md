# Performance measurements

## Measure graph work

The original implementation repeatedly rendered the entire app every 250 ms,
searched node arrays inside edge rendering, and rebuilt vertex content on pointer
samples. The current version isolates clock updates, indexes parents, memoizes
vertex/edge components, coalesces samples into animation frames, and removes
per-edge Gaussian blur.

To compare against another revision, build both in separate checkouts and serve
their production builds on different ports:

```sh
node scripts/benchmark-graph.mjs \
  http://127.0.0.1:4301/hyperforest/ \
  http://127.0.0.1:4302/hyperforest/ 500
```

The script uses the same graph, viewport, browser, and 60-sample pan for each build.
It prints idle/pan script CPU time, total pan task time, and layout time from
Chromium's performance metrics. Results depend on hardware and load; they do not
measure GPU frame pacing. Use browser Performance/React profiling to investigate
remaining bottlenecks before changing the renderer or adding caches.

A local comparison on 2026-10-16, with 500 vertices and a 60-sample pan in
headless Chromium 155.0.8059.79 against baseline commit `b075773`, measured:

| Metric | Original checkout | Refactor |
| --- | ---: | ---: |
| Script CPU during 2.5 seconds idle | 188.8 ms | 0.0 ms |
| Script CPU during pan | 1031.6 ms | 166.4 ms |
| Total main-thread task CPU during pan | 32669.5 ms | 1623.9 ms |

This is one sequential run against production builds, without CPU throttling.
It supports reduced rendering work on that workload; it is not an FPS guarantee.
The retained benchmark script allows repeating the measurement on other hardware.

## Measure the actual desktop app

On Linux with a display session, run:

```sh
npm run desktop:benchmark
```

This builds the optional `benchmark` Cargo feature and launches the production
Tauri/WebKit window with 500 vertices. It records startup to a saved graph,
idle/zoom frame intervals, and three rename/save round trips through Rust WASM,
native IPC, YAML/Markdown persistence, report generation, backups, and React.
Results and the complete test workspace remain in a printed directory under
`/tmp/hyperforest-desktop-perf.*` for inspection.

The harness refuses an existing workspace and requires its config directory to
be inside that temporary directory. It skips backup-timer registration, so it does
not change user services. Normal builds do not compile the harness or expose its
result command. Rebuild with `npm run desktop:build -- --no-bundle` afterward if
you want a normal production binary at the same output path.

WebKit frame intervals measure actual display pacing rather than Chromium's CPU
metrics. Do not compare these two measurements as if they were the same benchmark.

## Native result, 2026-10-16

The actual Tauri/WebKit desktop run used 500 visible vertices and isolated data,
config, and cache directories. It performed real saves and backup updates. The
first run revealed SVG painting as the remaining bottleneck; reducing detail only
during dense navigation brought frame intervals close to the idle cadence of this
display/session.

| Metric | Before navigation detail reduction | Final run |
| --- | ---: | ---: |
| Idle frame median | 32 ms | 32 ms |
| Zoom frame median | 182 ms | 32 ms |
| Zoom frame p95 | 189 ms | 35 ms |
| Startup to saved graph | 1985 ms | 1500 ms |
| Rename/save round trips | 260 / 242 / 250 ms | 584 / 410 / 402 ms |

The edit round trips did not improve in this pair of runs; disk/backup work and
full snapshot publication are still visible at 500 vertices. This is measured
application latency, not the Rust reducer's execution time. Initial full-detail
painting and gesture-end restoration can still produce an occasional slow frame
(the final run's maximum zoom interval was 167 ms). These single-run observations
are not general FPS or persistence-latency guarantees.

Raw results are in [performance-results.json](performance-results.json).
The dense navigation behavior is covered by a browser regression test: details
are hidden during the gesture and restored afterward. Nothing about the saved
graph changes when its rendering detail changes.

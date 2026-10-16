# Hyperforest

Hyperforest is a local-first graph of goals, Markdown notes, and focus sessions.
The browser app and the Tauri desktop app use the **same Rust domain compiled to
WebAssembly**, with a TypeScript/React interface. This folder is the standalone
[ogmutlu/hyperforest](https://github.com/ogmutlu/hyperforest) Git repository;
the Python `hiper` project in the parent directory is independent.

The domain is designed for later manual extraction with Charon/Aeneas and proof
in Lean. **It has not been extracted or formally verified.** Its executable rules
are isolated from serialization, rendering, filesystem operations, and clocks.
See the [verification guide](docs/VERIFICATION.md) for the exact boundary and
candidate theorems.

## Start

Requires Node 24+, npm, Rust/Cargo, and these one-time tools:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.114 --locked
npm ci
npm run dev
```

Run commands from this folder. Open the printed `/hyperforest/` URL. The npm
`dev`, `test`, and `build` commands build the Rust WASM module automatically;
there is no TypeScript fallback implementation of the domain.

For the desktop app, install the Linux libraries listed in [DESKTOP.md](DESKTOP.md),
then run `npm run desktop:dev`.

## Use

Create a hypertree, enable **Edit graph**, and add goals. Drag vertices to place
them and drag edge handles to reconnect them. **Options → pedantic** requires
connected graphs and connected color classes. It is off by default.

Double-click a goal or select **Focus** to start its timer. **Pause & return**
excludes the pause from focus time. Save the session to retain it. Internal goals
use the task name `General`; leaf goals use their own name. Finishing a goal
preserves its subtree, notes, and history. Deletion removes vertices but retains
session history.

The desktop app saves the current YAML workspace and real Markdown files in a
directory you choose. **Export** creates a ZIP using the same format:

```text
workspace.yaml     editable workspace metadata
notes/*.md         editable Markdown notes
structure.yaml     derived detailed hierarchy and time report
simple.yaml        derived names, hierarchy, and readable durations
```

**Import** accepts this ZIP format. No older formats or migrations are supported.
The browser stores its current in-memory snapshot in localStorage; it can exchange
workspaces with desktop through these ZIPs. JSON is used for internal transport,
not as an alternative backup format.

Read [data and reports](docs/DATA.md) before editing files, and
[desktop storage and backups](DESKTOP.md) for conflict handling and recovery.

## Read the code

A useful order for learning is:

1. [Architecture](docs/ARCHITECTURE.md): dependencies and the path of one command.
2. [`crates/domain/src/model.rs`](crates/domain/src/model.rs): Rust records/enums.
3. [`crates/domain/src/lib.rs`](crates/domain/src/lib.rs): validated state and transitions.
4. [`transition.rs`](crates/domain/src/transition.rs), then `validation.rs`, `graph.rs`, and `time.rs`.
5. [`crates/bridge/src/document.rs`](crates/bridge/src/document.rs): conversion at the boundary.
6. [`src/domainClient.ts`](src/domainClient.ts), then [`src/storage.ts`](src/storage.ts): typed calls and persistence.
7. [`src/App.tsx`](src/App.tsx), [`src/Graph.tsx`](src/Graph.tsx), and the small graph/clock components.
8. [Verification](docs/VERIFICATION.md): assumptions, proof obligations, and extraction instructions.

[Development](docs/DEVELOPMENT.md) covers coding style, tests, builds, and deployment.
[Performance](docs/PERFORMANCE.md) records the browser and actual desktop tests.
The GitHub Pages workflow builds and tests the shared Rust domain before publishing
the web app.

## Checks

```sh
npm run rust:check
npm test
npm run format:check
npm run build
npm run test:e2e
npm run desktop:test
```

Tests exercise the actual compiled Rust WASM, including in the Node test runner.
Browser tests use Playwright Chromium; install it with `npx playwright install chromium`
or set `CHROMIUM_PATH` to an existing Chromium executable.

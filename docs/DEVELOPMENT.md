# Development and coding style

Run commands at the Hyperforest repository root. Node 24 is recorded in `.nvmrc`.
The Rust WASM dependency and CLI must both be version `0.2.114`. `Cargo.lock` and
`package-lock.json` pin application dependencies.

## Build paths

```sh
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.114 --locked
npm run dev                 # builds Rust WASM, then starts Vite
npm run build               # builds WASM, checks TypeScript, bundles production
npm run preview             # serves the existing production build
npm run desktop:dev         # Tauri + the same Vite interface and WASM
npm run desktop:build -- --bundles deb
```

`scripts/build-domain.sh` invokes Cargo and wasm-bindgen. Generated `.js`, `.d.ts`,
and `.wasm` files go to `src/generated/`, which is ignored by Git and Prettier.
Vite includes the WASM as a versioned production asset. Do not hand-edit bindings.
The production Tauri CSP permits fetching bundled assets through `connect-src
'self'` and WASM compilation with `wasm-unsafe-eval`.

The root Cargo workspace contains only domain and bridge. `src-tauri` has its own
Cargo package and lockfile, so testing or extracting the core does not build GTK,
WebKit, or Tauri. In a native Rust program, depend directly on `crates/domain`.

## Style

- Use `cargo fmt` and `cargo clippy`; unsafe Rust is forbidden in the core/bridge.
- Prefer explicit data and straightforward functions over generic frameworks.
- Keep domain decisions in Rust and transport/presentation decisions at the edge.
- Return typed domain errors; write user-facing messages in the bridge.
- Supply IDs and time as arguments. Do not read environmental state in the core.
- Use checked arithmetic for growing durations. Do not silently wrap time.
- Use Prettier and strict TypeScript, including checked indexed access and exact
  optional properties. Prefer `unknown` at external boundaries and validate it.
- Treat snapshots as immutable. React component state is for transient interaction;
  saved workspace changes go through `Workspace.commit`.
- Keep hooks unconditional and declare their dependencies. Cache costly work only
  where unchanged inputs allow reuse. Use refs for pending pointer samples, not
  as an alternative authoritative workspace.
- Comment invariants, units, ownership, and nonobvious decisions. Avoid comments
  that merely repeat a function name or assignment.

## Verification commands

```sh
npm run rust:check          # core/bridge format, clippy, native Rust tests
npm test                    # TypeScript adapters against the actual Rust WASM
npm run format:check
npm run build
npx playwright install chromium
npm run test:e2e            # browser behavior, including desktop IPC mocks
npm run desktop:test        # real native filesystem/lock/conflict/backup tests
```

`CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` uses an installed system browser.
The WASM unit-test initializer is `tests/setup.ts`. Browser tests use it to build
their fixtures under Node, then the real application initializes WASM in Chromium.
There is no mocked TypeScript domain used for these tests.

Tests cover semantic regressions and boundaries: rejected graph edits, focus
interval accounting, overflow, current-format YAML/notes, both reports, storage
failure/conflicts, tray actions, and actual pointer interactions. Tests are not
formal proofs; see [VERIFICATION.md](VERIFICATION.md).

## Performance

See [PERFORMANCE.md](PERFORMANCE.md) for reproducible browser and native desktop
measurements, the optional harness, and recorded results.

## Deployment

The repository's GitHub Pages workflow builds Rust/WASM, runs Rust and TypeScript
checks and Chromium tests, then uploads `dist/`. The Vite base path is `/hyperforest/`
for Pages and relative for desktop. Enable Pages from GitHub Actions in the repository.
No Git remote, commit, push, installed desktop package, or user data directory is
changed by the build commands.


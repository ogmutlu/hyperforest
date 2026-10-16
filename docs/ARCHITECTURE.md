# Architecture

There are three layers. Dependencies point toward the domain.

```text
React interface (src/)
    │ synchronous typed calls
    ▼
JSON / WASM bridge (crates/bridge)
    │ ordinary Rust calls
    ▼
Pure domain (crates/domain)

React persistence adapters
    ├── browser: localStorage + Web Locks
    └── desktop: Tauri IPC → src-tauri/src/store.rs → filesystem
```

Both applications execute the same WASM module. There is no separate native
implementation of the rules and no duplicated TypeScript reducer. The desktop
shell provides native services; it does not decide graph or accounting rules.
The domain can also be used directly as a normal Rust library.

## Domain

`hyperforest-domain` uses `#![no_std]` and `alloc`, with no Cargo dependencies.
It uses structs, enums, vectors, slices, options, results, and integer arithmetic.
It has no GUI types, floating-point coordinates, JSON, serde, system calls,
randomness, wall-clock access, threads, or asynchronous code.

- `model.rs`: records, command enum, error enum, limits, and color identities.
- `lib.rs`: `State` contains a private validated `Snapshot`.
- `validation.rs`: graph, identity, color-connectivity, and interval invariants.
- `transition.rs`: command effects on a candidate snapshot.
- `graph.rs`: paths, descendants, links, and color assignment.
- `time.rs`: interval overlap, live focus duration, and cumulative totals.

`Snapshot` is an untrusted interchange value. `State::new(snapshot)` validates it.
`State::apply(&self, command, now)` clones the snapshot, applies the command,
validates the result, and returns a new state. An error leaves the input unchanged.
Time and identities come from the caller, so the same inputs give the same result.
The vector-based validator favors explicit proof obligations over sophisticated
collections; uniqueness checks and repeated graph walks are not intended for
unbounded histories. Validation runs on commits/imports, never on pointer samples.

The domain treats names and IDs as byte sequences. The bridge requires UTF-8,
trims names, and applies the 100-character UI limit. The domain additionally checks
nonempty names, a 400-byte bound, and no leading/trailing ASCII whitespace. This
keeps Unicode decoding out of the intended proof target without removing name
uniqueness from the business rules. `u64` milliseconds avoid floating-point time.
Colors are 24-bit integers because color connectivity is a domain rule.

## Bridge

`hyperforest-bridge` depends on the domain, serde, serde_json, and wasm-bindgen.
It converts the current version-1 transport schema into domain records and
converts results back. It also retains presentation fields by stable identity:
notes, notes filenames, coordinates, fill, and finished-vertex visibility.

`command.rs` separates business commands from presentation edits. For example,
reparenting goes into the domain; moving a vertex only updates coordinates.
Layout uses floating-point geometry in `layout.rs`, outside the domain.
Unicode, decimal minutes, JSON schema decoding, and error messages also live here.

The WASM `Domain` handle is immutable. TypeScript caches a handle in a `WeakMap`
for each snapshot, avoiding JSON parsing during repeated graph queries. Snapshot
objects are treated as immutable; updates always create a new one. `model.ts`
contains only transport types. `domainClient.ts` calls Rust and caches results; it does
not implement graph validation, state transitions, or focus accounting.

## One command: reconnect a vertex

1. `Graph.tsx` tracks pointer motion locally in React. The graph preview is UI state.
2. On pointer-up it sends `{ type: "connect", id, parentId }` to `Workspace.commit`.
3. The adapter refreshes the browser snapshot or queues a desktop transaction.
4. Rust rejects cycles, cross-tree edges, finished targets, active-subtree moves,
   and violations of pedantic connectivity. The old snapshot remains intact.
5. The persistence adapter saves the complete result before publishing it.
6. `useSyncExternalStore` tells React that a new saved snapshot is available.

For desktop, an unchanged externally edited note is merged before the returned
snapshot is published. Conflicts and disk failures are surfaced to the interface.

## Rendering

- `App.tsx` coordinates selection, dialogs, and commands.
- `Graph.tsx` owns camera, pointer capture, drag previews, and edge hit testing.
- `GraphVertex.tsx` and `GraphEdge.tsx` are memoized SVG components.
- `useFrameState.ts` coalesces pointer samples into one update per animation frame.
  Its ref retains the final sample even if pointer-up precedes the next frame.
- `Clock.tsx` confines clock subscriptions to the text displaying time.
- `presentation.ts` formats durations and filters the history by local dates/text.

The graph does not rerender on a global 250-ms timer. Parent lookups use an indexed
map. Panning changes the SVG group transform while memoized vertices/edges keep
unchanged content. Unselected nodes and edges no longer require Gaussian blur
filters. In graphs above 150 visible vertices, navigation temporarily hides
connections, labels (except the selection), and decoration, restoring them after
the gesture. This avoids WebKit repainting hundreds of text/curve elements on
every camera sample. Live focus is displayed in its own full-screen view; graph totals refresh
on state changes, including pause/save. Today and the focus timer update locally.

## Persistence and trust

`workspaceFiles.ts` is the shared codec for `workspace.yaml` plus `notes/*.md`.
`export.ts` creates ZIPs and the derived `structure.yaml` and `simple.yaml` reports.
`desktop.ts` coordinates native storage. `store.rs` owns locking, atomic individual
file replacement, external-edit checks, and daily backups. Multi-file saves are
not a filesystem transaction: a process or disk failure can interrupt a save
between files. Retained notes and daily snapshots assist recovery.

The proof target is the pure domain. The bridge, compiler/WASM runtime, clocks,
identity generation, rendering, timezone calculations, persistence, and OS remain
outside it. A proof of the domain alone is not a proof of the whole application.

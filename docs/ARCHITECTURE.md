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
- `SessionHistory.tsx` owns the history filters, manual-edit forms, and a compact
  table paginated at 100 rows. The modal locks background scrolling and bounds
  its own scroll area. Statistics are queried only while history is open.
  `calendar.ts` converts inclusive local date filters to successive midnight
  boundaries (including 23/25-hour DST days) and matches subject text. It performs
  no duration accounting. `crates/domain/src/history.rs` clips periods, counts
  sessions and active days, and computes checked integer totals and averages.
  The bridge only serializes the results; `domainClient.ts` exposes their types.
- `DateField.tsx` is the shared calendar for filters and manual sessions. It has
  an explicit toggle, strict ISO date entry, date limits, and keyboard navigation.
  Its popup remains inside the modal's DOM, positioned against the viewport to
  avoid clipping by the history scroll area. Escape dismisses only the calendar;
  outside clicks, scrolling, and resizing dismiss it without moving focus back.
  It owns no accounting rules and adds no UI dependency.
- `historyRange.ts` persists only the last valid date-filter endpoints in local
  interface storage. Partial/invalid entry does not replace the saved interval;
  malformed preferences fall back to the all-time range. No accounting result,
  session data, or domain state is stored in this preference.
- `DesktopApp.tsx` applies and remembers interface zoom in WebView local storage.
  Zoom is a local presentation preference, not workspace or domain state.
- `DesktopSaveStatus.tsx` supplies Autosaved in the narrow desktop status bar.
  Its tooltip exposes the native directory only on hover/focus; its disclosure
  holds storage controls. Interface zoom stays beside Autosaved in the bar.
  Save timestamps are published with successful
  native writes, never before an operation succeeds. Today remains a separate
  workspace-wide counter beside the brand, formatted in hours and minutes.
- `FocusSession.tsx` presents the expanded timer or compact dock. Timer size is
  React state in `App.tsx`, independent of Rust's running/paused session state.
  Pause/resume/save/discard issue domain commands; minimize/expand never do.
- `ActionMenu.tsx` provides button disclosures with outside-click and Escape
  dismissal. Secondary actions stay accessible without crowding the toolbar.
- `Graph.tsx` owns camera, pointer capture, drag previews, and edge hit testing.
- `GraphVertex.tsx` and `GraphEdge.tsx` are memoized SVG components.
- `useFrameState.ts` coalesces pointer samples into one update per animation frame.
  Its ref retains the final sample even if pointer-up precedes the next frame.
- `Clock.tsx` confines clock subscriptions to the text displaying time.
- `tray.ts` serializes native menu actions and status updates. The native
  `src-tauri/src/tray.rs` renders activity badges and menu labels; it owns no
  accounting rules. Pause, resume, and save still use the same domain commands.
  Space in `FocusSession.tsx` invokes pause/resume only for a noninteractive focus
  surface, ignoring repeats, modifiers, and text entry.
- `presentation.ts` formats durations and reads normalized colors.

The graph does not rerender on a global 250-ms timer. Parent lookups use an indexed
map. Panning changes the SVG group transform while memoized vertices/edges keep
unchanged content. Unselected nodes and edges no longer require Gaussian blur
filters. In graphs above 150 visible vertices, navigation temporarily hides
connections, labels (except the selection), and decoration, restoring them after
the gesture. This avoids WebKit repainting hundreds of text/curve elements on
every camera sample. Live focus appears in its own large view or compact dock;
graph totals refresh on state changes, including pause/save. Today and the focus
timer update locally. Pausing keeps the timer's size and position. The global
Today counter belongs to the header; goal totals belong to the selection.

## Persistence and trust

`workspaceFiles.ts` is the shared codec for `workspace.yaml` plus `notes/*.md`.
`export.ts` creates ZIPs and the derived `structure.yaml` and `simple.yaml` reports.
`archiveTransfer.ts` selects host transport: browser download/Save As, or native
commands in `src-tauri/src/archive.rs`. Native Save/Open dialogs and binary file
I/O run off the UI thread; ZIP encoding and validation stay shared. The desktop
flushes its workspace before export, including external Markdown edits. A running
focus is paused in the exported copy using the existing Rust command, so restoring
an archive does not count the time spent moving it. The source timer keeps running.
Import validates the ZIP and shows a replacement preview before the ordinary
`Workspace.replace` persistence path. Cancelled dialogs do not replace data;
file errors remain visible. There is no separate desktop archive schema.
`desktop.ts` coordinates native storage. `store.rs` owns locking, atomic individual
file replacement, external-edit checks, and daily backups. Multi-file saves are
not a filesystem transaction: a process or disk failure can interrupt a save
between files. Retained notes and daily snapshots assist recovery.

The proof target is the pure domain. The bridge, compiler/WASM runtime, clocks,
identity generation, rendering, timezone calculations, persistence, and OS remain
outside it. A proof of the domain alone is not a proof of the whole application.

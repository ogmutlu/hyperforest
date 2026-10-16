# Intended verification with Aeneas and Lean

Status: Rust tests, TypeScript/WASM tests, and application checks are executable
validation. **No Charon extraction or Lean proof has been run for this project.**
The domain is structured to make that later work small and explicit. Compatibility
with a particular future Charon/Aeneas revision is not guaranteed by compilation.

## Scope

Extract only `crates/domain`. Its Cargo manifest has no dependencies. The domain
uses safe sequential Rust, integer time, opaque bytes, vectors, and bounded graph
walks. It avoids serde, strings/Unicode operations, floats, system calls, interior
mutability, traits with dynamic dispatch, and async/concurrent code.

Start with `time::period_duration`, `time::focus_elapsed`, and the graph traversal
helpers. Then establish the validator's meaning before proving command behavior.
`State::apply` provides a convenient entry point, but deriving its validated-state
postcondition alone does not establish that the validator expresses the intended
mathematical specification. Prove the validator sound with respect to that
specification as a separate obligation.

## Mathematical model

A hypertree has one distinguished root; its host graph may be a forest when
pedantic is off. Each nonroot vertex has at most one parent, in its own hypertree.
Parent edges are acyclic. Active siblings have unique names; finished siblings
may retain reused names. Active vertices cannot have finished parents.

In pedantic mode the active host graph is connected. For every assigned color,
the active vertices carrying that color induce a connected subtree. Multiple
colors describe overlapping hyperedges. In a forest, a nonempty induced subgraph
is connected exactly when its edge count is one less than its vertex count; this
is the criterion implemented by the validator.

Links between hypertrees form a directed acyclic dependency graph. A link to a
deleted hypertree contributes zero and cannot be focused. Deleting vertices keeps
historical sessions; those sessions still contribute to global day totals but
cannot be attributed to missing vertices in a remaining graph.

All times are unsigned integer milliseconds. Saved focus periods are ordered,
nonoverlapping, and contained within their session span. Their durations sum to
`duration_ms`. A running focus additionally has an open interval beginning at
`running_since`; paused time is excluded. Names/groups are captured when a focus
starts. Stable IDs preserve attribution across renaming.

## Candidate theorems

Use ordinary natural/integer arithmetic in the specification, and explicitly
relate it to Rust `u64` results and overflow errors.

1. **Validation soundness:** successful `State::new` implies the graph, identity,
   name, color, and interval invariants above.
2. **Preservation:** applying a command to a valid state either returns a valid
   state or an error, without changing the original value.
3. **No panics:** under the declared preconditions, indexing, subtraction, and
   other partial operations are safe; numeric overflow returns `Error::Overflow`.
4. **Pause accounting:** pause/resume/save credits exactly the union of recorded
   focus intervals, with no paused interval credited. Repeated pause is idempotent.
5. **Window accounting:** overlap counts exactly the intersection of each period
   with the supplied time window. Global time counts each session once.
6. **Ancestor accounting:** each attributed session contributes once to its
   vertex and each ancestor. Disconnected components additionally credit the
   distinguished root once. Reparenting changes attribution, not session data.
7. **Deletion/finish:** deletion retains history and rejects active-subtree
   removal; finishing preserves nodes and saves active focus in the finished subtree.
8. **Link accounting:** dependency-order evaluation agrees with a recursive DAG
   specification. One source session is stored once, even when several views link it.

Tests in `crates/domain/tests/invariants.rs` illustrate these properties, including
an exhaustive small-graph check. They are examples, not substitutes for proofs.

## Environment assumptions

- The caller supplies fresh IDs for newly created records. The validator rejects
  duplicates among current records; IDs for deleted records must not be reused.
- Clock samples are Unix milliseconds. Callers should supply nondecreasing samples
  during a focus session. A backward query clamps its running contribution to zero;
  resuming before recorded periods and inconsistent saves are rejected.
- Calendar-day boundaries are supplied by the interface. Prove interval arithmetic
  independently from the browser's timezone and daylight-saving implementation.
- Allocation failure, the Rust compiler, the extraction toolchain, the WASM runtime,
  UTF-8/JSON conversion, and filesystem durability are outside the domain theorem.
- Linked totals describe each displayed view. They are not summed across hypertrees
  to compute global Today, which would count linked contributions multiple times.

## Manual extraction workflow

Use the [official Aeneas instructions](https://github.com/AeneasVerif/aeneas)
for a mutually compatible Aeneas checkout, its pinned Charon, and Lean backend.
Do not choose independent latest versions of these three components.

From the domain crate, using the Rust toolchain expected by that Charon:

```sh
cd crates/domain
charon cargo --preset=aeneas
```

Locate the emitted `hyperforest_domain.llbc` (the output location depends on the
Charon revision/configuration), then invoke your Aeneas binary:

```sh
aeneas -backend lean -split-files /path/to/hyperforest_domain.llbc
```

Create your Lean proof package separately. Use the `lean-toolchain` from the
matching Aeneas `backends/lean` and depend on that same backend revision. Keep
handwritten specifications/proofs separate from generated definitions so that
regeneration does not overwrite them. No fabricated generated Lean files or
placeholder theorems are included in this repository.

If extraction reports an unsupported standard-library operation or a derived
implementation, first minimize it and replace the operation with a small explicit
loop or supply a justified model. Vector operations and generated `Clone`/`Eq`
implementations are specific places to inspect. The no-dependency design narrows
the work; it does not assert that every standard-library call is already modeled.

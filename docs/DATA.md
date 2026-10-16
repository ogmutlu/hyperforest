# Workspace data and reports

One workspace directory contains:

```text
workspace.yaml
structure.yaml
simple.yaml
notes/
  Research - Read --example.md
backups/
  YYYY-MM-DD/
    workspace.yaml
    structure.yaml
    simple.yaml
    notes/
```

`workspace.yaml` and Markdown notes are the source data. The reports are derived;
editing a report does not change the app. Both are regenerated on desktop saves
and included in ZIP exports and daily snapshots. Exported directories and desktop
directories use the same layout. JSON backups, old storage keys, schema migrations,
and historical interval reconstruction from ambiguous durations are not supported.

## workspace.yaml

The version-1 document holds `trees`, `nodes`, `sessions`, and `focus`. Each node's
`notesFile` is a filename inside `notes/`; the text lives in that actual Markdown
file. Stable names survive renaming a goal. Missing notes, unsafe filenames,
malformed metadata, invalid graphs, or unsupported versions produce errors.

This minimal example is a complete current workspace when accompanied by
`notes/Research.md`:

```yaml
version: 1
trees:
  - id: research
    title: Research
    createdAt: 1792108800000
    pedantic: false
    showFinished: false
nodes:
  - id: research
    treeId: research
    parentId: null
    title: Research
    estimateMinutes: 0
    notesFile: Research.md
    color: '#dfc491'
    filled: true
    multipleColors: false
    x: 550
    y: 130
sessions: []
focus: null
```

Session times and focus samples use integer Unix milliseconds. Session `periods`
must be ordered, nonoverlapping, inside the session span, and sum to `durationMs`.
The current YAML format permits omitting `periods` for a continuous session whose
`durationMs` equals `endedAt - startedAt`. The bridge supplies that exact interval;
zero elapsed time needs no intervals. Focus records can likewise omit `periods`
when `elapsedMs` is zero or equals `runningSince - startedAt`. Missing intervals
with ambiguous pause locations are rejected, rather than estimated.

The Rust domain always receives explicit periods, and saves/exports always write
them. For focus records, their sum is the accumulated `elapsedMs`, and
`runningSince` records the current open interval or is null.

Graph IDs must be unique and parent links must stay inside the same hypertree.
Tree IDs are also their root-node IDs. Session history may reference deleted
vertices; that history is deliberately retained. Reusing an old identity manually
is outside the freshness assumptions of the domain.

## structure.yaml

This detailed report contains hierarchy, stable IDs, timestamps, assigned colors,
links, and cumulative time in both readable form and precise milliseconds. It is
useful for inspecting attribution or processing the report with other programs.
Totals include saved and active focus and linked hypertrees. A disconnected
component credits the distinguished root as well as its own ancestors.

## simple.yaml

This report contains only goal names, hierarchy, human-readable focus/estimate
durations, and relevant status. There are no IDs, raw millisecond fields, colors,
coordinates, notes filenames, timestamps, or schema versions.

```yaml
hypertrees:
  - name: Research
    focused: 1h2m3s
    estimate: 10h0m0s
    children:
      - name: Read papers
        focused: 0h32m3s
      - name: First draft
        focused: 0h30m0s
        finished: true
```

A linked vertex has a `linked` name. Separate components appear under `unconnected`.
Finished goals remain visible in reports, regardless of the interface's ghost
visibility setting. Totals already include descendants, so adding all displayed
rows would count the same focus repeatedly.

## Editing and recovery

Stop the app before editing metadata. Do not edit a note in two places at once.
An external-only Markdown edit can be merged; simultaneous app/editor changes
produce an error. Deleted vertices' note files remain on disk for recovery.
The directory lock prevents two cooperating desktop instances from writing it.
It does not lock out arbitrary editors.

Individual files are replaced atomically. The entire directory is not a multi-file
transaction. Keep a copy of important work before manual bulk edits. A dated
snapshot can be opened directly or copied into a fresh directory.

The browser uses localStorage for its working snapshot and Web Locks for
cooperating tabs when the API is available. Export a ZIP to move it to desktop or
to keep a portable copy. Import requires the current `workspace.yaml` and its notes;
reports are regenerated and are not an alternative import format.

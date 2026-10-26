# hyperforest on Linux

The desktop app uses the same React/TypeScript interface and compiled Rust WASM
domain as the web app. Tauri supplies the native window, directory picker,
filesystem services, and tray. See [architecture](docs/ARCHITECTURE.md).

## Run or install

Install the Linux build dependencies first (Debian/Ubuntu):

```sh
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev librsvg2-dev patchelf libayatana-appindicator3-dev
```

The tray requires the AppIndicator development package, even if the runtime
`libayatana-appindicator3-1` is already installed. Without its `pkg-config`
metadata, Tauri's bundler panics with `Can't detect any appindicator library`.
Check detection with `pkg-config --modversion ayatana-appindicator3-0.1`.

With Rust and Node.js installed, build an installable Debian package:

```sh
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.114 --locked
npm run desktop:build -- --bundles deb
sudo apt install ./src-tauri/target/release/bundle/deb/hyperforest_1.1.0_amd64.deb
```

Launch **hyperforest** from your application menu, or run
`src-tauri/target/release/hyperforest-desktop` directly after building. For development:

```sh
npm run desktop:dev
```

The Debian package uses the system WebKitGTK runtime. An AppImage target is also
configured (`npm run desktop:build -- --bundles appimage`).

## Select the data directory

On first launch choose a directory. Once open, a narrow desktop status bar shows
**Autosaved** and interface zoom:
hover or keyboard-focus it to see the directory and last successful save time.
Click **Autosaved** for **Change directory** and **Back up now**.
The directory stays hidden during normal use; errors remain visible.
An existing `workspace.yaml` opens that workspace. An empty
directory receives the current workspace when changing directories; the old
directory stays intact. Browser data is separate: use **Export** on the website,
then **Import** in the desktop app to transfer a current YAML/Markdown ZIP.
The reverse works too: desktop **Export** opens the native Save dialog and writes
the same ZIP the web app accepts. Desktop **Import** uses the native Open dialog;
both apps validate the archive and preview replacement before saving it. Notes,
session history, graph metadata, and identities travel together. Export first
saves desktop edits and reads externally edited notes. A running timer is paused
in the portable copy at export time, while the original timer keeps running.

```text
chosen-directory/
  workspace.yaml          # complete workspace metadata, including active focus
  structure.yaml          # detailed hierarchy and cumulative focus times
  simple.yaml             # names and readable durations; no IDs or colors
  notes/
    Hypertree - Vertex --identifier.md
  backups/
    YYYY-MM-DD/
      workspace.yaml
      structure.yaml
      simple.yaml
      notes/
```

Markdown contents live in the files, rather than inside `workspace.yaml`.
`notesFile` connects each vertex to its file. Names stay stable after renaming a
vertex; a short identifier prevents collisions when names are reused. The regular
in-app notes editor remains available; **Open Markdown file** opens the actual
file in your system's default editor.

Edits save immediately before the interface reports success. Autosave also runs
every 30 seconds, incorporating external Markdown edits. Files are written
atomically, and a directory lock prevents two desktop instances from writing the
same workspace. Conflicting edits produce an error instead of overwriting notes.
Changing `workspace.yaml` externally requires restarting the app before saving.
Do not edit metadata and notes concurrently in the app and another editor.

Deleted vertices' Markdown files remain on disk for recovery. **Clear local data**
clears the current YAML workspace; notes and backups remain. Finished vertices,
their notes, and their history remain part of the workspace.

## Daily backups

The app maintains one complete snapshot per local calendar day, updating today's
snapshot on every save and retaining the latest 30 daily snapshots. All Markdown
files in `notes/`, including retained files, are backed up.

Choosing or reopening a data directory enables the user service
`hyperforest-backup.timer`. It invokes `hyperforest-desktop --backup-only`, so
backups also run when the window is closed. It follows the currently selected
directory. The timer requires a systemd user session; missed runs are caught on
the next login. If enabling it fails, the app displays an error and continues
making backups while open.

```sh
systemctl --user status hyperforest-backup.timer
systemctl --user list-timers hyperforest-backup.timer
```

The remembered directory is stored in
`~/.config/io.github.ogmutlu.hyperforest/data-directory` (or under `XDG_CONFIG_HOME`).
Restore a snapshot by selecting its dated directory, or copy it to a new directory
and select that copy. Keep important backups on another disk as well.

Checks: `npm test`, `npm run test:e2e`, and `npm run desktop:test`.

Use the − / percentage / + controls above the app to zoom the entire interface.
Keyboard shortcuts are Ctrl+plus, Ctrl+minus, and Ctrl+0 to reset. Ctrl+scroll on
menus also changes interface zoom; Ctrl+scroll over the graph changes its camera.
The last successfully applied interface zoom is restored on startup. This is a
local interface preference in the WebView's persistent storage, independent of
the chosen workspace and its YAML/ZIP backups. Invalid stored values use 100%.

The history icon to the right of Today opens the desktop ledger. It has compact
table rows, 100 sessions per page, and independent scrolling. All totals and
averages use the Rust domain, including clipping focus periods at the selected
local date boundaries. Pauses and unsaved focus do not enter history statistics.
The daily average includes every selected calendar day, even days without focus.
The active-day average counts only days with recorded focus. Both endpoints are
inclusive; blank endpoints mean first saved session through today. A session
crossing midnight can appear in either day; **Focus in range** shows its clipped
duration, while **Full session** preserves its complete recorded duration.
Use each date field's calendar button to choose a day, or type `YYYY-MM-DD`.
The same calendar serves history filters and manual session dates. It supports
month/year selection, arrow keys, Page Up/Down (Shift for a year), and Alt+Down
from the input. Escape closes the calendar first, leaving history open.
The last valid From/To selection is remembered when history is reopened and
across app restarts. Clear filters resets it to the all-time range. Like zoom,
this is a local interface preference and is not included in workspace backups.

The tray icon adds a green play badge while focusing and an amber pause badge
while paused. With no session it shows the ordinary logo. The menu groups the
goal and elapsed time above **Open hyperforest**, a single **Pause session** /
**Resume session** control, and **Save & finish**. When idle, **Start a session…**
opens the app to choose a goal. The icon changes only on activity changes; the
elapsed time updates every second. Space pauses/resumes in the large focus view
without minimizing it; typing and focused buttons keep their normal behavior.

Tray controls reflect the same saved session as the window. Closing the window
hides it while focus and autosave continue; use **Open hyperforest** to return. **Quit hyperforest**
pauses and saves before exiting. If a save fails, the window opens with the error
instead of quitting. Your desktop panel must support tray/AppIndicator icons.

Only the current workspace YAML and Markdown format is supported. Reports are
derived and regenerated on saves. See [DATA.md](docs/DATA.md) for their roles.

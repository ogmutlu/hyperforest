Hyperforest v1.1.0 for Linux x86-64.

- Five vertex types: vanilla goals, deadlines with live countdowns, thoughts with adaptive oval outlines, readings with file or website attachments, and habits with configurable frequency and repetition counters.
- A right-side toolbar groups Edit graph and Options above the five creation symbols, with hover and keyboard-focus labels.
- New vertices start isolated, preserve every existing position, focus the name field immediately, and enter edit mode after creation. Connect them later with edge handles.
- An interactive practice tutorial uses the actual app controls to teach all five vertex types, dragging, connections, notes, focus, habit tracking, and history filters. Practice data stays in memory and never replaces your workspace or saved filters.
- Reading files open in the desktop system viewer; attached websites open in a browser. Habit counters and vertex metadata survive restarts and ZIP transfers.
- Existing focus sessions, Markdown notes, daily backups, ZIP import/export, system tray controls, interface zoom, and hiper session integration remain available.

To connect an updated hiper checkout, open its **Settings (F7)** and select the
Hyperforest data folder containing `workspace.yaml`, or run:

```sh
hiper set --hyperfokus-dir "/path/to/hyperforest/data"
```

Hyperforest imports saved sessions within 30 seconds while open, or when the
workspace next opens. Quit Hyperforest before upgrading and restart it afterward.

Download the `.deb` and install it on Ubuntu 22.04+ or Debian 12+:

```sh
sudo apt install ./hyperforest_1.1.0_amd64.deb
```

`SHA256SUMS` contains the package checksum. Existing version-1 workspaces load as
vanilla vertices. Export a backup before upgrading; reading attachments retain
their paths rather than copying the attached files into the backup.

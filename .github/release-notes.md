Hyperforest v1.2.0 for Linux x86-64.

- Create children from the selected vertex, or record isolated thoughts with a compact editable preview.
- Track reading progress by percentage or pages, and review habit completion on a calendar.
- Keep the selected vertex panel beside the graph on wide screens, with an option to move it above.
- Resize the graph and keep its height across sessions; opening a tree centers its root near the top of the graph without moving vertices.
- Configure automatic desktop recovery snapshots, with a weekly interval by default. Autosave continues on every save.
- Keep graph actions in a vertical symbol toolbar beside the graph.

To connect an updated hiper checkout, open its **Settings (F7)** and select the
Hyperforest data folder containing `workspace.yaml`, or run:

```sh
hiper set --hyperfokus-dir "/path/to/hyperforest/data"
```

Hyperforest imports saved sessions within 30 seconds while open, or when the
workspace next opens. Quit Hyperforest before upgrading and restart it afterward.

Download the `.deb` and install it on Ubuntu 22.04+ or Debian 12+:

```sh
sudo apt install ./hyperforest_1.2.0_amd64.deb
```

`SHA256SUMS` contains the package checksum. Existing workspaces remain supported.

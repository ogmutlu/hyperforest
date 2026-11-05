Hyperforest v1.3.0 for Linux x86-64.

- Group vertices in buckets: drop them in, move the bucket with its contents, or drag a vertex out. The inspector lists each bucket's contents.
- Capture thoughts as rounded cards that snap together. Resize thoughts and buckets in edit mode; double-click a thought to open its full text.
- Keep standalone thoughts and buckets in pedantic graphs without weakening connectivity checks for ordinary goals.
- Restore each tree's last pan and zoom across tab switches and restarts. Use **Show all** to fit the graph into view.
- Collapse the inspector with **Hide vertex panel**. Right-click vertices for relevant actions and notes. A panel opened temporarily from a context menu closes on an empty graph click; an already open panel stays open.
- Record habit repetitions from the context menu or compact horizontal controls. Edit history as daily counts, with paginated recorded days for large histories.
- Change deadlines from either the inspector or the context menu. Reading progress now uses a slim color-matched bar with a percentage label.
- Distinguish finishing a subgoal from leaving edit mode with a dedicated flag icon.

Existing version-1 workspaces remain supported. Bucket membership and resized vertex dimensions are included in saved workspaces and backups; graph view preferences are remembered on each device.

To connect an updated hiper checkout, open its **Settings (F7)** and select the
Hyperforest data folder containing `workspace.yaml`, or run:

```sh
hiper set --hyperfokus-dir "/path/to/hyperforest/data"
```

Hyperforest imports saved sessions within 30 seconds while open, or when the
workspace next opens. Quit Hyperforest before upgrading and restart it afterward.

Download the `.deb` and install it on Ubuntu 22.04+ or Debian 12+:

```sh
sudo apt install ./hyperforest_1.3.0_amd64.deb
```

Verify the downloaded package with `sha256sum --check SHA256SUMS`.

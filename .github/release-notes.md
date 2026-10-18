Hyperforest v1.0.0 for Linux x86-64, updated with hiper session integration.

- Goals, Markdown notes, focus timers, and session history with date and subject filters.
- Notes no longer displays the inactive time-estimate field.
- Import saved hiper sessions from the selected workspace folder, preserving pause intervals and avoiding duplicate imports.
- Sessions attach to a node with an exact, unique title match. Missing or ambiguous titles go to a matching node under the `hiper` tree; the tree and node are created as needed.
- Local workspace files, daily backups, ZIP import/export, system tray controls, and persistent interface zoom.

To connect an updated hiper checkout, open its **Settings (F7)** and select the
Hyperforest data folder containing `workspace.yaml`, or run:

```sh
hiper set --hyperfokus-dir "/path/to/hyperforest/data"
```

Hyperforest imports saved sessions within 30 seconds while open, or when the
workspace next opens. This replaces the previous v1.0.0 package; reinstall the
package below and restart Hyperforest to use the updated build.

Download the `.deb` and install it on Ubuntu 22.04+ or Debian 12+:

```sh
sudo apt install ./hyperforest_1.0.0_amd64.deb
```

`SHA256SUMS` contains the package checksum. Keep workspace backups before upgrading.

Hyperforest v2.0.0 for Linux x86-64.

- **Valued Habits (pure Rust domain):** Track habits by repetitions, numeric values (pages, km, minutes — with optional units, lower `≥` or upper `≤` bounds, and sum or per-entry evaluation), or time of day (`00:00–23:59`, e.g. wake-up time `≤ 07:30`). Unrecorded periods stay unrecorded rather than falsely met.
- **Custom Weekday Habit Schedules:** Schedule habits on specific days of the week (e.g. every Tuesday and Friday) with rest days clearly distinguished in progress and monthly history.
- **Steam-Style Achievements & Trophy Hall:** Full-screen Trophy Hall with permanent core achievements, secret CS & linguistics achievements (hidden until unlocked), resetting **Today's Wins** (up to 7 hours), open-ended **Endless Milestones** (+5h focus forever, repeatable high-focus combos, Green & Deep workweeks), and compact Core & Daily progress bars in the top bar.
- **Satisfying Popups & Desktop Notifications:** Tiered confetti bursts, Steam-inspired synthesized chimes with combo pitch scaling, persistent toasts until dismissed, and native Linux desktop notifications with the Hyperforest icon.
- **Monthly Focus Calendar:** Big Monday-first monthly calendar inside Session History showing daily focused hours (1 decimal place) with a color-coded performance scale.

Existing version-1 workspaces remain fully supported and automatically backfill historical achievements on first load.

Download the `.deb` and install it on Ubuntu 22.04+ or Debian 12+:

```sh
sudo apt install ./hyperforest_2.0.0_amd64.deb
```

Verify the downloaded package with `sha256sum --check SHA256SUMS`.

// Injected only by an explicitly enabled benchmark build. Runs in actual WebKit.
(async () => {
  const send = (report) => window.__TAURI_INTERNALS__.invoke("desktop_benchmark_result", { report });
  const wait = async (predicate, timeout = 30000) => {
    const start = performance.now();
    while (!predicate()) {
      if (performance.now() - start > timeout) throw new Error("Timed out waiting for benchmark UI: " + document.body.innerText.slice(0, 500));
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  const frame = () => new Promise(requestAnimationFrame);
  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return { frames: samples.length, medianMs: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1),
      over25ms: samples.filter((sample) => sample > 25).length };
  };
  const click = (text) => {
    const button = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === text);
    if (!button) throw new Error("Missing button: " + text);
    button.click();
  };
  try {
    await wait(() => document.querySelector('[data-testid="node-root"]') && document.querySelector('.desktop-save-status summary[aria-label="Autosaved"]'));
    const startupToSavedGraphMs = performance.now();
    const svg = document.querySelector(".graph-svg");
    const samples = async (count, zoom) => {
      const values = [];
      let previous = await frame();
      for (let i = 0; i < count; i++) {
        if (zoom) svg.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: i % 2 === 0 ? -35 : 35 }));
        const now = await frame();
        values.push(now - previous);
        previous = now;
      }
      return summarize(values);
    };
    const idleFrames = await samples(60, false);
    const zoomFrames = await samples(120, true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    click("Edit graph");
    const editsMs = [];
    for (let i = 1; i <= 3; i++) {
      await wait(() => document.querySelector('[aria-label="Rename selected vertex"]:not(:disabled)'));
      document.querySelector('[aria-label="Rename selected vertex"]').click();
      await wait(() => document.querySelector('[aria-label="Vertex name"]'));
      const input = document.querySelector('[aria-label="Vertex name"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, `Benchmark edit ${i}`);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await frame();
      const start = performance.now();
      input.form.requestSubmit();
      await wait(() => !document.querySelector(".inline-rename"));
      editsMs.push(performance.now() - start);
    }
    // Exercise the new keyboard behavior and the real native tray update path,
    // outside the measured graph intervals. All data lives in this run's /tmp dir.
    const trayState = async (running, paused) => {
      await window.__TAURI_INTERNALS__.invoke("desktop_tray_state", {
        focusName: "Benchmark edit 3",
        timer: document.querySelector('[data-testid="focus-timer"]')?.textContent.trim() ?? "00:00:00",
        running, paused,
      });
    };
    click("Focus");
    await wait(() => document.querySelector('.focus-screen[data-running="true"]') === document.activeElement);
    await trayState(true, false);
    const space = () => document.querySelector(".focus-screen").dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    space();
    await wait(() => document.querySelector('.focus-screen[data-running="false"]'));
    await trayState(false, true);
    space();
    await wait(() => document.querySelector('.focus-screen[data-running="true"]'));
    await trayState(true, false);
    click("Save & finish");
    await wait(() => !document.querySelector(".focus-screen"));
    await trayState(false, false);
    if (document.querySelector(".desktop-error")) throw new Error(document.querySelector(".desktop-error").textContent);
    await send({ engine: navigator.userAgent, vertices: 500, devicePixelRatio,
      startupToSavedGraphMs, idleFrames, zoomFrames, editAndSaveMs: editsMs,
      focusKeyboardAndTrayChecks: "passed: running, paused, resumed, saved; native tray updates succeeded",
      note: "Visible production Tauri/WebKit window. Includes real Rust WASM, IPC, reports, disk writes, and daily backup updates. Frame intervals include display pacing." });
  } catch (error) { await send({ error: String(error) }); }
})();

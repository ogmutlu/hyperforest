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
    const previousReport = sessionStorage.getItem("hyperforest-benchmark-before-reload");
    if (previousReport) {
      await wait(() => document.querySelector('[aria-label="Reset interface zoom"]')?.textContent.trim() === "110%" && document.querySelector('.desktop-save-status summary[aria-label="Autosaved"]'));
      if (document.querySelector(".desktop-error")) throw new Error(document.querySelector(".desktop-error").textContent);
      document.querySelector('[aria-label="Session history"]').click();
      await wait(() => document.querySelector('.history-dialog[open]'));
      const savedRange = JSON.parse(localStorage.getItem("hyperforest.history-range"));
      const toInput = [...document.querySelectorAll('.date-field')].find((field) => field.querySelector("label")?.textContent === "To date").querySelector("input");
      if (toInput.value !== savedRange.to || !toInput.value) throw new Error("History interval was not restored after reload");
      document.querySelector('[aria-label="Choose to date"]').click();
      await wait(() => document.querySelector('[aria-label="To date calendar"]'));
      const popup = document.querySelector('.date-calendar').getBoundingClientRect();
      if (popup.left < 0 || popup.right > innerWidth || popup.top < 0 || popup.bottom > innerHeight) throw new Error("Calendar is clipped at restored zoom");
      [...document.querySelectorAll('.date-calendar button')].find((button) => button.textContent.trim() === "Close calendar").click();
      document.querySelector('[aria-label="Close dialog"]').click();
      const report = JSON.parse(previousReport);
      sessionStorage.removeItem("hyperforest-benchmark-before-reload");
      await send({ ...report, historyAndZoomChecks: "passed: native history table and statistics, independent scroll area, interface zoom and selected interval restored after reload; calendar positioned at restored zoom" });
      return;
    }
    await wait(() => document.querySelector('[data-testid="node-root"]') && document.querySelector('.desktop-save-status summary[aria-label="Autosaved"]'));
    const initialDevicePixelRatio = devicePixelRatio;
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
    document.querySelector('[aria-label="Session history"]').click();
    await wait(() => document.querySelector('.history-list tbody tr') && document.querySelector('.history-statistics dd'));
    const scroll = document.querySelector(".history-scroll");
    if (getComputedStyle(scroll).overflowY !== "auto" || document.body.style.overflow !== "hidden") throw new Error("History does not isolate scrolling");
    const fromCalendar = document.querySelector('[aria-label="Choose from date"]');
    const toCalendar = document.querySelector('[aria-label="Choose to date"]');
    for (let i = 0; i < 4; i++) {
      fromCalendar.click();
      await wait(() => document.querySelector('[aria-label="From date calendar"]'));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await wait(() => !document.querySelector(".date-calendar"));
      if (!document.querySelector('.history-dialog[open]')) throw new Error("Calendar Escape closed history");
    }
    fromCalendar.click();
    await wait(() => document.querySelector('[aria-label="From date calendar"]'));
    toCalendar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    toCalendar.click();
    await wait(() => document.querySelector('[aria-label="To date calendar"]') && document.querySelectorAll(".date-calendar").length === 1);
    const calendarBox = document.querySelector(".date-calendar").getBoundingClientRect();
    if (calendarBox.left < 0 || calendarBox.right > innerWidth || calendarBox.top < 0 || calendarBox.bottom > innerHeight) throw new Error("Calendar is outside the viewport");
    document.querySelector('.date-calendar button[aria-current="date"]').click();
    await wait(() => !document.querySelector(".date-calendar"));
    click("Change history");
    await wait(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Add session"));
    click("Add session");
    await wait(() => document.querySelector('[aria-label="Choose session start date"]'));
    document.querySelector('[aria-label="Choose session start date"]').click();
    await wait(() => document.querySelector('[aria-label="Session start date calendar"]'));
    document.querySelector('.date-calendar button[data-day][tabindex="0"]').click();
    await wait(() => !document.querySelector(".date-calendar"));
    if (!document.querySelector(".manual-session")) throw new Error("Calendar accidentally submitted the session form");
    document.querySelector('[aria-label="Close dialog"]').click();
    await wait(() => !document.querySelector('.history-dialog[open]'));
    const menuAction = async (name) => {
      const menu = document.querySelector('[aria-label="Workspace actions"]');
      menu.click();
      await wait(() => menu.parentElement.open);
      click(name);
    };
    await menuAction("Export");
    let exportedBytes;
    const exportStart = performance.now();
    while (!exportedBytes) {
      try { exportedBytes = await window.__TAURI_INTERNALS__.invoke("desktop_import_archive"); }
      catch (error) { if (performance.now() - exportStart > 30000) throw error; await new Promise((resolve) => setTimeout(resolve, 20)); }
    }
    if (exportedBytes[0] !== 80 || exportedBytes[1] !== 75) throw new Error("Native export did not write a ZIP file");
    await wait(() => ![...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Export").disabled);
    document.querySelector('[aria-label="Rename selected vertex"]').click();
    await wait(() => document.querySelector('[aria-label="Vertex name"]'));
    const renamed = document.querySelector('[aria-label="Vertex name"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(renamed, "Changed after export");
    renamed.dispatchEvent(new Event("input", { bubbles: true }));
    await frame();
    renamed.form.requestSubmit();
    await wait(() => !document.querySelector(".inline-rename"));
    await menuAction("Import");
    await wait(() => document.querySelector('dialog[aria-label="Import backup"]'));
    click("Cancel");
    await wait(() => !document.querySelector('dialog[aria-label="Import backup"]'));
    if (!document.querySelector('.node-heading').textContent.includes("Changed after export")) throw new Error("Cancelled import changed the workspace");
    await menuAction("Import");
    await wait(() => document.querySelector('dialog[aria-label="Import backup"]'));
    click("Replace workspace");
    await wait(() => !document.querySelector('dialog[aria-label="Import backup"]') && document.querySelector('.node-heading').textContent.includes("Benchmark edit 3"));
    if (document.querySelector('[role="alert"]')) throw new Error(document.querySelector('[role="alert"]').textContent);
    document.querySelector('[aria-label="Zoom interface in"]').click();
    await wait(() => localStorage.getItem("hyperforest.interface-zoom") === "1.1");
    const report = { engine: navigator.userAgent, vertices: 500, devicePixelRatio: initialDevicePixelRatio,
      startupToSavedGraphMs, idleFrames, zoomFrames, editAndSaveMs: editsMs,
      focusKeyboardAndTrayChecks: "passed: running, paused, resumed, saved; native tray updates succeeded",
      calendarChecks: "passed: repeated open/close, Escape isolation, switching fields, selection, viewport bounds, manual-session date selection",
      archiveChecks: "passed: production native ZIP write/read paths, export through interface, cancelled import preserves data, confirmed import restores the workspace",
      note: "Visible production Tauri/WebKit window. Includes real Rust WASM, IPC, reports, disk writes, and daily backup updates. Frame intervals include display pacing." };
    sessionStorage.setItem("hyperforest-benchmark-before-reload", JSON.stringify(report));
    location.reload();
  } catch (error) { await send({ error: String(error) }); }
})();

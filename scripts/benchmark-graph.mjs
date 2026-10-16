// Usage: node scripts/benchmark-graph.mjs BASELINE_URL CURRENT_URL [vertices]
// Run production servers first. This measures one machine, not a universal FPS claim.
import { chromium } from "@playwright/test";
const [baseline, current, countText = "500"] = process.argv.slice(2);
if (!baseline || !current)
  throw new Error("Supply baseline and current app URLs.");
const count = Number(countText);
if (!Number.isInteger(count) || count < 2 || count > 2000)
  throw new Error("Use 2 to 2000 vertices.");
const state = {
  version: 1,
  trees: [
    { id: "root", title: "Performance example", createdAt: 0, pedantic: false },
  ],
  nodes: Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? "root" : `v${i}`,
    treeId: "root",
    parentId: i === 0 ? null : "root",
    title: i === 0 ? "Performance example" : `Goal ${i}`,
    estimateMinutes: 0,
    notes: "",
    color: i === 0 ? "#dfc491" : "#80c9bc",
    filled: true,
    x: i === 0 ? 550 : 50 + (i % 20) * 50,
    y: i === 0 ? 80 : 150 + Math.floor(i / 20) * 20,
  })),
  sessions: [],
  focus: null,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  for (const [name, url] of [
    ["baseline", baseline],
    ["current", current],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    });
    await page.addInitScript(
      (value) =>
        localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(value)),
      state,
    );
    await page.goto(url);
    await page.getByTestId("node-root").waitFor();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const beforeIdle = await metrics();
    await page.waitForTimeout(2500);
    const afterIdle = await metrics();
    const graph = await page.locator(".graph-svg").boundingBox();
    if (!graph) throw new Error("Graph is missing.");
    const x = graph.x + 20,
      y = graph.y + 20;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const beforePan = await metrics();
    await page.mouse.move(x + 240, y + 80, { steps: 60 });
    await page.mouse.up();
    const afterPan = await metrics();
    const delta = (from, to, key) =>
      Math.round((to[key] - from[key]) * 10000) / 10;
    console.log(
      JSON.stringify({
        name,
        vertices: count,
        idleScriptMs: delta(beforeIdle, afterIdle, "ScriptDuration"),
        panScriptMs: delta(beforePan, afterPan, "ScriptDuration"),
        panTaskMs: delta(beforePan, afterPan, "TaskDuration"),
        panLayoutMs: delta(beforePan, afterPan, "LayoutDuration"),
      }),
    );
    if (name === "current")
      await page.screenshot({ path: "/tmp/hyperforest-current.png" });
    await page.close();
  }
} finally {
  await browser.close();
}

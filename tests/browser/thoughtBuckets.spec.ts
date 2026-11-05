import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apply } from "../../src/domainClient";
import type { State } from "../../src/model";
import { vertexGeometry } from "../../src/vertices";
import { readWorkspace, workspaceFiles } from "../../src/workspaceFiles";
import { installDesktopMock } from "./desktopHarness";

async function snapshot(page: Page, desktop: boolean): Promise<State> {
  if (!desktop)
    return page.evaluate(() =>
      JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!),
    );
  const files = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test.desktop.files")!),
  );
  return readWorkspace(files.yaml, files.notes);
}
async function point(page: Page, id: string, x = 0, y = 0) {
  return page.getByTestId(`node-${id}`).evaluate(
    (element, offset) => {
      const point = new DOMPoint(offset.x, offset.y).matrixTransform(
        (element as unknown as SVGGraphicsElement).getScreenCTM()!,
      );
      return { x: point.x, y: point.y };
    },
    { x, y },
  );
}
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".graph")).not.toHaveClass(/is-dragging/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

for (const desktop of [false, true]) {
  test(`thought snapping and bucket drops persist in pedantic mode (${desktop ? "desktop" : "web"})`, async ({
    page,
  }, testInfo) => {
    const now = Date.now();
    let state: State = {
      version: 1,
      trees: [],
      nodes: [],
      sessions: [],
      focus: null,
    };
    state = apply(state, { type: "create", id: "root", title: "Ideas" }, now);
    state = apply(
      state,
      { type: "pedantic", treeId: "root", enabled: true },
      now,
    );
    for (const [id, title, vertex, x, y] of [
      ["first", "First idea", { kind: "thought" }, 200, 300],
      ["second", "Second idea", { kind: "thought" }, 200, 450],
      ["bucket", "Collected ideas", { kind: "bucket" }, 700, 500],
    ] as const) {
      state = apply(
        state,
        { type: "isolate", id, treeId: "root", title, vertex },
        now,
      );
      state = apply(state, { type: "move", id, x, y }, now);
    }
    await page.addInitScript((state) => {
      localStorage.setItem("hyperforest.tutorial.web.v1", "seen");
      localStorage.setItem("hyperforest.tutorial.desktop.v1", "seen");
      if (!localStorage.getItem("hyperforest.workspace.v1"))
        localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
    }, state);
    if (desktop)
      await installDesktopMock(page, {
        directory: "/tmp/hyperforest-desktop-test",
        ...workspaceFiles(state),
      });
    await page.goto("./");
    await page
      .getByRole("button", { name: "Create thought vertex", exact: true })
      .click();
    await page
      .getByLabel("Thought text", { exact: true })
      .fill("A thought created while pedantic");
    await expect(
      page.getByRole("button", { name: "Create vertex", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Create vertex", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    await expect(page.locator(".graph-svg > g")).toHaveAttribute(
      "transform",
      /scale\(0\./,
    );
    await expect(page.getByTestId("node-fill-first")).toHaveJSProperty(
      "tagName",
      "rect",
    );
    await expect(page.getByTestId("node-fill-first")).toHaveAttribute(
      "rx",
      "14",
    );
    const first = state.nodes.find((n) => n.id === "first")!;
    const second = state.nodes.find((n) => n.id === "second")!;
    const edge = vertexGeometry(first).rx + vertexGeometry(second).rx;
    await drag(
      page,
      await point(page, "first"),
      await point(page, "second", edge + 8, 4),
    );
    let saved = await snapshot(page, desktop);
    const moved = saved.nodes.find((n) => n.id === "first")!;
    expect(moved.x).toBeCloseTo(second.x + edge);
    expect(moved.y).toBeCloseTo(second.y);
    await drag(
      page,
      await point(page, "first"),
      await point(page, "bucket", -70, 0),
    );
    saved = await snapshot(page, desktop);
    expect(saved.nodes.find((n) => n.id === "first")?.bucketId).toBe("bucket");
    const before = saved.nodes.find((n) => n.id === "first")!;
    const header =
      -vertexGeometry(
        saved.nodes.find((n) => n.id === "bucket")!,
        saved.nodes,
      ).ry + 20;
    await drag(
      page,
      await point(page, "bucket", 0, header),
      await point(page, "bucket", 50, header + 40),
    );
    saved = await snapshot(page, desktop);
    expect(saved.nodes.find((n) => n.id === "first")?.x).toBeCloseTo(
      before.x + 50,
    );
    expect(saved.nodes.find((n) => n.id === "first")?.y).toBeCloseTo(
      before.y + 40,
    );
    expect(saved.nodes.find((n) => n.id === "first")?.parentId).toBeNull();
    const contents = page.getByRole("group", {
      name: "Bucket contents",
      exact: true,
    });
    await expect(contents).toContainText("Contents (1)");
    await expect(contents.getByRole("button")).toHaveCount(1);
    await contents
      .getByRole("button", { name: "First idea", exact: true })
      .click();
    await expect(page.locator(".inspector h2")).toHaveText("First idea");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Select Collected ideas", exact: true })
      .click({ position: { x: 30, y: 30 } });
    await page.screenshot({ path: testInfo.outputPath("thought-bucket.png") });
    await page.reload();
    saved = await snapshot(page, desktop);
    expect(saved.nodes.find((n) => n.id === "first")?.bucketId).toBe("bucket");
    expect(saved.trees[0]?.pedantic).toBe(true);
    await page.getByRole("button", { name: "Edit graph", exact: true }).click();
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    await drag(
      page,
      await point(page, "first"),
      await point(page, "bucket", -450, 0),
    );
    expect(
      (await snapshot(page, desktop)).nodes.find((n) => n.id === "first")
        ?.bucketId,
    ).toBeUndefined();
    await page
      .getByRole("button", { name: "Select Collected ideas", exact: true })
      .click({ position: { x: 30, y: 30 } });
    await expect(contents).toContainText("Contents (0)");
    await expect(contents).toContainText("No vertices in this bucket yet");
  });
}

for (const desktop of [false, true]) {
  test(`resize cards and fit all vertices (${desktop ? "desktop" : "web"})`, async ({
    page,
  }, testInfo) => {
    const now = Date.now();
    let state: State = {
      version: 1,
      trees: [],
      nodes: [],
      sessions: [],
      focus: null,
    };
    state = apply(
      state,
      { type: "create", id: "root", title: "Resize test" },
      now,
    );
    for (const [id, title, vertex, x, y] of [
      ["thought", "A thought to resize", { kind: "thought" }, 220, 280],
      ["bucket", "A bucket to resize", { kind: "bucket" }, 760, 450],
    ] as const) {
      state = apply(
        state,
        { type: "isolate", id, treeId: "root", title, vertex },
        now,
      );
      state = apply(state, { type: "move", id, x, y }, now);
    }
    await page.addInitScript((state) => {
      localStorage.setItem("hyperforest.tutorial.web.v1", "seen");
      localStorage.setItem("hyperforest.tutorial.desktop.v1", "seen");
      if (!localStorage.getItem("hyperforest.workspace.v1"))
        localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
    }, state);
    if (desktop)
      await installDesktopMock(page, {
        directory: "/tmp/hyperforest-desktop-test",
        ...workspaceFiles(state),
      });
    await page.goto("./");
    await expect(
      page.getByRole("button", {
        name: "Resize A thought to resize",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Edit graph", exact: true }).click();
    const fit = page.getByRole("button", { name: "Fit graph", exact: true });
    await expect(fit).toHaveText("Show all");
    await fit.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(localStorage.getItem("hyperforest.graph-zoom")),
        ),
      )
      .toBeLessThan(1);
    for (const id of ["thought", "bucket"]) {
      const before = (await snapshot(page, desktop)).nodes.find(
        (node) => node.id === id,
      )!;
      const size = vertexGeometry(before);
      await drag(
        page,
        await point(page, id, size.rx - 5, size.ry - 5),
        await point(page, id, size.rx + 55, size.ry + 35),
      );
      const after = (await snapshot(page, desktop)).nodes.find(
        (node) => node.id === id,
      )!;
      expect(after.size?.width).toBeCloseTo(size.rx * 2 + 60);
      expect(after.size?.height).toBeCloseTo(size.ry * 2 + 40);
      expect(after.x - after.size!.width / 2).toBeCloseTo(before.x - size.rx);
      expect(after.y - after.size!.height / 2).toBeCloseTo(before.y - size.ry);
      await expect(
        page.getByTestId(`node-${id}`).locator(".node-time"),
      ).toHaveCount(0);
    }
    const handle = page.getByRole("button", {
      name: "Resize A thought to resize",
      exact: true,
    });
    const beforeKeyboard = (await snapshot(page, desktop)).nodes.find(
      (node) => node.id === "thought",
    )!.size!;
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(
        async () =>
          (await snapshot(page, desktop)).nodes.find(
            (node) => node.id === "thought",
          )?.size?.width,
      )
      .toBeCloseTo(beforeKeyboard.width + 10);
    const saved = (await snapshot(page, desktop)).nodes.map(
      ({ id, x, y, size }) => ({ id, x, y, size }),
    );
    await page.reload();
    await expect(page.getByTestId("node-fill-thought")).toBeVisible();
    expect(
      (await snapshot(page, desktop)).nodes.map(({ id, x, y, size }) => ({
        id,
        x,
        y,
        size,
      })),
    ).toEqual(saved);
    for (let i = 0; i < 5; i++)
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await fit.click();
    await expect
      .poll(async () => {
        const graph = (await page.locator(".graph-svg").boundingBox())!;
        const fills = await page.locator("[data-testid^=node-fill]").all();
        return Promise.all(
          fills.map(async (fill) => {
            const bounds = (await fill.boundingBox())!;
            return (
              bounds.x >= graph.x &&
              bounds.y >= graph.y &&
              bounds.x + bounds.width <= graph.x + graph.width &&
              bounds.y + bounds.height <= graph.y + graph.height
            );
          }),
        );
      })
      .toEqual([true, true, true]);
    await page.screenshot({
      path: testInfo.outputPath("resizable-vertices.png"),
    });
  });
}

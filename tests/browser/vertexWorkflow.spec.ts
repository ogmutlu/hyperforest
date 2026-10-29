import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { sampleWorkspace } from "../sampleWorkspace";
import { apply } from "../../src/domainClient";
import type { State, VertexKind } from "../../src/model";
import { workspaceFiles, readWorkspace } from "../../src/workspaceFiles";
import { installDesktopMock } from "./desktopHarness";

async function initialize(
  page: Page,
  desktop: boolean,
  panel: "top" | "auto" = "top",
  state: State = sampleWorkspace(Date.now()),
) {
  await page.addInitScript(
    ({ state, panel }) => {
      if (
        panel !== "auto" &&
        localStorage.getItem("hyperforest.panel-position") === null
      )
        localStorage.setItem("hyperforest.panel-position", panel);
      localStorage.setItem("hyperforest.tutorial.web.v1", "seen");
      localStorage.setItem("hyperforest.tutorial.desktop.v1", "seen");
      if (!localStorage.getItem("hyperforest.workspace.v1"))
        localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
    },
    { state, panel },
  );
  if (desktop)
    await installDesktopMock(page, {
      directory: "/tmp/hyperforest-desktop-test",
      ...workspaceFiles(state),
    });
  await page.goto("./");
  await expect(page.locator(".graph")).toBeVisible();
}
async function snapshot(page: Page, desktop: boolean): Promise<State> {
  if (!desktop)
    return page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!) as State,
    );
  const files = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("test.desktop.files")!) as {
        yaml: string;
        notes: Record<string, string>;
      },
  );
  return readWorkspace(files.yaml, files.notes);
}
async function create(page: Page, kind: VertexKind, text: string) {
  await page
    .getByRole("button", { name: `Create ${kind} vertex`, exact: true })
    .click();
  await page
    .getByLabel(kind === "thought" ? "Thought text" : "Goal name", {
      exact: true,
    })
    .fill(text);
  if (kind !== "thought") {
    const name = (await page
      .getByLabel("Goal name", { exact: true })
      .boundingBox())!;
    const parent = (await page
      .getByLabel("Parent vertex", { exact: true })
      .boundingBox())!;
    const link = (await page
      .getByLabel("Link another hypertree", { exact: true })
      .boundingBox())!;
    expect(name.height).toBeGreaterThanOrEqual(60);
    expect(name.y + name.height).toBeLessThan(parent.y);
    expect(parent.y).toBe(link.y);
    expect(parent.x + parent.width).toBeLessThan(link.x);
  }
  if (kind === "thought") {
    await expect(page.getByLabel("Link another hypertree")).toHaveCount(0);
    await expect(page.getByLabel("Parent vertex")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function select(page: Page, title: string) {
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
}

for (const desktop of [false, true]) {
  const host = desktop ? "desktop" : "web";
  test(`${host}: toolbar, stable inspector, child creation and saved reading progress`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    const graphTop = await page
      .locator(".graph")
      .evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      );
    await select(page, "Discover");
    await create(page, "reading", "Current book");
    await expect(page.locator(".inspector h2")).toHaveText("Discover");
    const added = (await snapshot(page, desktop)).nodes.find(
      (node) => node.title === "Current book",
    )!;
    expect(added.parentId).toBe("discover");
    await select(page, "Current book");
    const summary = (await page.locator(".inspector-summary").boundingBox())!;
    const functions = (await page
      .locator(".vertex-details-slot")
      .boundingBox())!;
    expect(summary.x + summary.width).toBeLessThan(functions.x);
    expect(summary.y).toBe(functions.y);
    const heading = (await page
      .locator(".inspector .node-heading")
      .boundingBox())!;
    const selectionActions = (await page
      .locator(".inspector .selection-actions")
      .boundingBox())!;
    expect(heading.x + heading.width).toBeLessThanOrEqual(selectionActions.x);
    expect(Math.abs(heading.y - selectionActions.y)).toBeLessThan(2);
    expect((await page.locator(".inspector").boundingBox())!.height).toBe(112);
    expect(
      await page
        .locator(".graph")
        .evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        ),
    ).toBe(graphTop);
    const actions = page.getByRole("navigation", {
      name: "Graph editing",
      exact: true,
    });
    const bar = (await page
      .getByRole("navigation", { name: "Graph tools", exact: true })
      .boundingBox())!;
    const strip = (await actions.boundingBox())!;
    expect(strip.x + strip.width).toBeLessThanOrEqual(bar.x);
    const buttons = await actions.getByRole("button").all();
    expect(buttons).toHaveLength(3);
    const boxes = await Promise.all(
      buttons.map((button) => button.boundingBox()),
    );
    expect(boxes[0]!.x).toBe(boxes[2]!.x);
    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
    await page.getByLabel("Total pages", { exact: true }).fill("200");
    await page.getByLabel("Reading percent", { exact: true }).fill("25");
    await expect(page.getByLabel("Pages read", { exact: true })).toHaveValue(
      "50",
    );
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await expect(
      page.getByLabel("Saved reading progress", { exact: true }),
    ).toHaveAttribute("value", "25");
    await page.getByLabel("Pages read", { exact: true }).fill("80");
    await expect(
      page.getByLabel("Reading percent", { exact: true }),
    ).toHaveValue("40");
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await snapshot(page, desktop)).nodes.find(
            (node) => node.id === added.id,
          )?.vertex,
      )
      .toMatchObject({ pagesRead: 80, totalPages: 200, progressPercent: 40 });
    await page.reload();
    await select(page, "Current book");
    await expect(page.getByLabel("Pages read", { exact: true })).toHaveValue(
      "80",
    );
    await page.getByRole("button", { name: "Edit graph", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit attachment", exact: true })
      .click();
    await page
      .getByLabel("File path or website", { exact: true })
      .fill("https://example.org/book");
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.getByLabel("Pages read", { exact: true })).toHaveValue(
      "80",
    );
    await page.screenshot({
      path: testInfo.outputPath("reading.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 900, height: 1050 });
    const details = (await page.locator(".vertex-details").boundingBox())!;
    const graph = (await page.locator(".graph").boundingBox())!;
    expect(details.y + details.height).toBeLessThanOrEqual(graph.y);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await select(page, "Discover");
    expect(
      await page
        .locator(".graph")
        .evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        ),
    ).toBe(graphTop);
  });

  test(`${host}: choosing a different parent restores that parent after creation`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await select(page, "Discover");
    await page
      .getByRole("button", { name: "Create vanilla vertex", exact: true })
      .click();
    await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveValue(
      "discover",
    );
    await page
      .getByLabel("Goal name", { exact: true })
      .fill("A different branch");
    await page
      .getByLabel("Parent vertex", { exact: true })
      .selectOption("create");
    await page.screenshot({ path: testInfo.outputPath("vertex-creation.png") });
    await page
      .getByRole("button", { name: "Create vertex", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".inspector h2")).toHaveText("Create");
    expect(
      (await snapshot(page, desktop)).nodes.find(
        (node) => node.title === "A different branch",
      )?.parentId,
    ).toBe("create");
  });

  test(`${host}: long names truncate without pushing Notes and Focus off the row`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await page.getByRole("button", { name: "Edit graph", exact: true }).click();
    await page
      .getByRole("button", { name: "Rename selected vertex", exact: true })
      .click();
    const title =
      "A very long vertex name that should end in an ellipsis while its action buttons stay visible";
    await page.getByLabel("Vertex name", { exact: true }).fill(title);
    await page
      .getByRole("button", { name: "Save vertex name", exact: true })
      .click();
    const name = page.getByRole("button", {
      name: "Rename selected vertex",
      exact: true,
    });
    await expect(name).toHaveAttribute("title", title);
    expect(
      await name.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    await expect(name).toHaveCSS("text-overflow", "ellipsis");
    const heading = (await name.boundingBox())!;
    const actions = (await page.locator(".selection-actions").boundingBox())!;
    expect(heading.x + heading.width).toBeLessThanOrEqual(actions.x);
    expect(Math.abs(heading.y - actions.y)).toBeLessThan(2);
    await expect(
      page.getByRole("button", { name: "Edit goal", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Focus", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(1440);
    await page.screenshot({ path: testInfo.outputPath("long-heading.png") });
  });

  test(`${host}: thoughts are isolated with bounded previews and a full text editor`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await select(page, "Discover");
    const text = "Remember to investigate this promising idea carefully. "
      .repeat(30)
      .trim();
    await create(page, "thought", text);
    await expect(page.locator(".inspector h2")).toHaveText("Discover");
    const thought = (await snapshot(page, desktop)).nodes.find(
      (node) => node.vertex?.kind === "thought",
    )!;
    expect(thought.parentId).toBeNull();
    expect(thought.title).toBe("Remember to investigate this promising idea");
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    const preview = page
      .getByTestId(`node-${thought.id}`)
      .locator(".node-title");
    await expect(preview).toContainText("...");
    expect((await preview.textContent())!.length).toBeLessThanOrEqual(130);
    await preview.click();
    await expect(page.getByLabel("Thought text", { exact: true })).toHaveValue(
      text,
    );
    await page.screenshot({ path: testInfo.outputPath("thought-editor.png") });
    const revised = "Another thought with a different short heading. "
      .repeat(35)
      .trim();
    await page.getByLabel("Thought text", { exact: true }).fill(revised);
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.locator(".inspector h2")).toHaveText(
      "Another thought with a different short",
    );
    await page.reload();
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    await page.getByTestId(`node-fill-${thought.id}`).click();
    await expect(page.getByLabel("Thought text", { exact: true })).toHaveValue(
      revised,
    );
  });

  test(`${host}: habit calendar records days, browses history, and responds to undo`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await create(page, "habit", "Daily practice");
    await select(page, "Daily practice");
    await page
      .getByRole("button", { name: "Record repetition", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Record repetition", exact: true })
      .click();
    await page.getByLabel("Habit history", { exact: true }).click();
    await expect(page.locator(".habit-day.completed")).toHaveCount(1);
    await expect(page.locator(".habit-day.completed")).toHaveAccessibleName(
      /2 repetitions/,
    );
    await page.screenshot({
      path: testInfo.outputPath("habit-calendar.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Previous habit month", exact: true })
      .click();
    await expect(page.locator(".habit-day.completed")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Next habit month", exact: true })
      .click();
    await expect(page.locator(".habit-day.completed")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Undo last repetition", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Undo last repetition", exact: true })
      .click();
    await page.getByLabel("Habit history", { exact: true }).click();
    await expect(page.locator(".habit-day.completed")).toHaveCount(0);
  });
}

test("mobile inspector height stays fixed for reading and habit controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initialize(page, false);
  const top = await page
    .locator(".graph")
    .evaluate(
      (element) => element.getBoundingClientRect().top + window.scrollY,
    );
  for (const kind of ["reading", "habit"] as const) {
    await select(page, "A meaningful project");
    await create(page, kind, `Mobile ${kind}`);
    await select(page, `Mobile ${kind}`);
    expect(
      await page
        .locator(".graph")
        .evaluate(
          (element) => element.getBoundingClientRect().top + window.scrollY,
        ),
    ).toBe(top);
    const detailsBottom = await page
      .locator(".vertex-details")
      .evaluate(
        (element) => element.getBoundingClientRect().bottom + window.scrollY,
      );
    expect(detailsBottom).toBeLessThanOrEqual(top);
    if (kind === "habit")
      await page.getByLabel("Habit history", { exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${kind}.png`),
      fullPage: true,
    });
    if (kind === "habit") {
      const calendar = (await page
        .getByLabel("Habit history calendar", { exact: true })
        .boundingBox())!;
      expect(calendar.x).toBeGreaterThanOrEqual(0);
      expect(calendar.x + calendar.width).toBeLessThanOrEqual(390);
    }
  }
});

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "web"}: the narrow left panel is optional and remembered`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await create(page, "reading", "Sidebar reading");
    await select(page, "Sidebar reading");
    const before = (await snapshot(page, desktop)).nodes.map(
      ({ id, x, y }) => ({ id, x, y }),
    );
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("left");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    const inspector = (await page.locator(".inspector").boundingBox())!;
    const graph = (await page.locator(".map-panel").boundingBox())!;
    expect(inspector.width).toBeLessThanOrEqual(240);
    expect(inspector.x + inspector.width).toBeLessThanOrEqual(graph.x);
    expect(inspector.y).toBe(graph.y);
    await page.getByLabel("Total pages", { exact: true }).fill("100");
    await page.getByLabel("Pages read", { exact: true }).fill("30");
    await page
      .getByRole("button", { name: "Save progress", exact: true })
      .click();
    await expect(page.getByLabel("Saved reading progress")).toHaveAttribute(
      "value",
      "30",
    );
    expect(
      (await snapshot(page, desktop)).nodes.map(({ id, x, y }) => ({
        id,
        x,
        y,
      })),
    ).toEqual(before);
    await page.screenshot({
      path: testInfo.outputPath("left-inspector.png"),
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("top");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".workspace")).not.toHaveClass(/inspector-left/);
  });
}

test("desktop backup settings default to weekly, persist custom intervals, and keep autosave", async ({
  page,
}, testInfo) => {
  await initialize(page, true);
  await page.getByLabel("Autosaved", { exact: true }).click();
  await page
    .getByRole("button", { name: "Backup settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Automatic recovery backups", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Backup interval in days", { exact: true }),
  ).toHaveValue("7");
  await page.getByLabel("Backup interval in days", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Save backup settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Backup settings saved.");
  await page.screenshot({ path: testInfo.outputPath("backup-settings.png") });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page.getByLabel("Autosaved", { exact: true }).click();
  await page
    .getByRole("button", { name: "Backup settings", exact: true })
    .click();
  await expect(
    page.getByLabel("Backup interval in days", { exact: true }),
  ).toHaveValue("3");
  await page
    .getByLabel("Automatic recovery backups", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save backup settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Backup settings saved.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await create(page, "vanilla", "Autosave stays on");
  expect(
    (await snapshot(page, true)).nodes.some(
      (node) => node.title === "Autosave stays on",
    ),
  ).toBe(true);
  await page.getByLabel("Autosaved", { exact: true }).click();
  await page.getByRole("button", { name: "Back up now", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("test.manual-backups")),
    )
    .toBe("1");
});

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "web"}: panel defaults follow width until a layout is explicitly chosen`, async ({
    page,
  }) => {
    await initialize(page, desktop, "auto");
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.panel-position"),
      ),
    ).toBeNull();
    await page.setViewportSize({ width: 900, height: 1050 });
    await expect(page.locator(".workspace")).not.toHaveClass(/inspector-left/);
    await page.setViewportSize({ width: 1200, height: 1050 });
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("top");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await expect(page.locator(".workspace")).not.toHaveClass(/inspector-left/);
    await page.reload();
    await expect(page.locator(".workspace")).not.toHaveClass(/inspector-left/);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("left");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    await page.reload();
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("auto");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".workspace")).not.toHaveClass(/inspector-left/);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.panel-position"),
      ),
    ).toBeNull();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await expect(page.locator(".workspace")).toHaveClass(/inspector-left/);
  });
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "web"}: resized graph height survives layouts, tree switches, and reloads`, async ({
    page,
  }) => {
    await initialize(page, desktop);
    const graph = page.locator(".graph");
    await graph.scrollIntoViewIfNeeded();
    const original = (await graph.boundingBox())!;
    await page.mouse.move(
      original.x + original.width - 3,
      original.y + original.height - 3,
    );
    await page.mouse.down();
    await page.mouse.move(
      original.x + original.width - 3,
      original.y + original.height + 100,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => (await graph.boundingBox())!.height)
      .toBeGreaterThan(original.height + 80);
    const resized = (await graph.boundingBox())!.height;
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(localStorage.getItem("hyperforest.graph-height")),
        ),
      )
      .toBe(resized);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    await page
      .getByLabel("Selected vertex panel", { exact: true })
      .selectOption("left");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    expect((await graph.boundingBox())!.height).toBe(resized);
    await page
      .getByRole("button", { name: "New hypertree", exact: true })
      .click();
    await page
      .getByLabel("Hypertree name", { exact: true })
      .fill("Another tree");
    await page
      .getByRole("button", { name: "Create hypertree", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await graph.boundingBox())!.height).toBe(resized);
    await page.getByRole("tab", { name: /A meaningful project/ }).click();
    expect((await graph.boundingBox())!.height).toBe(resized);
    await page.reload();
    await expect(graph).toBeVisible();
    expect((await graph.boundingBox())!.height).toBe(resized);
    await graph.scrollIntoViewIfNeeded();
    const current = (await graph.boundingBox())!;
    await page.mouse.move(
      current.x + current.width - 3,
      current.y + current.height - 3,
    );
    await page.mouse.down();
    await page.mouse.move(current.x + current.width - 3, current.y + 450, {
      steps: 8,
    });
    await page.mouse.up();
    await expect
      .poll(async () => (await graph.boundingBox())!.height)
      .toBe(530);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(localStorage.getItem("hyperforest.graph-height")),
        ),
      )
      .toBe(530);
    await page.reload();
    await expect(graph).toBeVisible();
    expect((await graph.boundingBox())!.height).toBe(530);
  });
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "web"}: switching trees opens with each root at the top center without moving vertices`, async ({
    page,
  }) => {
    const now = Date.now();
    let state = apply(
      sampleWorkspace(now),
      { type: "create", id: "second", title: "Another tree" },
      now,
    );
    state = apply(state, { type: "move", id: "project", x: -250, y: 900 }, now);
    state = apply(state, { type: "move", id: "second", x: 1470, y: -360 }, now);
    await page.addInitScript(() =>
      localStorage.setItem("hyperforest.graph-height", "1000"),
    );
    await initialize(page, desktop, "top", state);
    const checkRoot = async (id: string) => {
      await expect
        .poll(async () => {
          const graph = (await page.locator(".graph-svg").boundingBox())!;
          const root = (await page
            .getByTestId(`node-fill-${id}`)
            .boundingBox())!;
          return [
            Math.round(root.x + root.width / 2 - graph.x - graph.width / 2),
            Math.round(root.y + root.height / 2 - graph.y),
          ];
        })
        .toEqual([0, 80]);
    };
    await checkRoot("project");
    for (const { width, panel } of [
      { width: 1440, panel: "left" },
      { width: 900, panel: "top" },
      { width: 390, panel: "top" },
    ]) {
      await page.setViewportSize({ width, height: 1200 });
      await page.getByRole("button", { name: "Options", exact: true }).click();
      await page
        .getByLabel("Selected vertex panel", { exact: true })
        .selectOption(panel);
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.getByRole("tab", { name: /Another tree/ }).click();
      await checkRoot("second");
      await page
        .getByRole("button", { name: "Fit graph", exact: true })
        .click();
      await page.getByRole("tab", { name: /A meaningful project/ }).click();
      await checkRoot("project");
    }
    expect(
      (await snapshot(page, desktop)).nodes.map(({ id, x, y }) => ({
        id,
        x,
        y,
      })),
    ).toEqual(state.nodes.map(({ id, x, y }) => ({ id, x, y })));
  });
}

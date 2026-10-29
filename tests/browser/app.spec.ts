import { installDesktopMock } from "./desktopHarness";
import "../setup";
import { sampleWorkspace } from "../sampleWorkspace";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DEFAULT_COLORS } from "../../src/presentation";
import { apply } from "../../src/domainClient";

async function goalAction(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
}
async function workspaceAction(page: Page, name: string): Promise<void> {
  await page.getByLabel("Workspace actions", { exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function pauseAndMinimize(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Minimize", exact: true }).click();
}

async function focusVertex(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Focus session", exact: true }),
  ).toBeVisible();
}
async function openNotes(page: Page, title: string): Promise<void> {
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
}
async function chooseColor(page: Page, color: string): Promise<void> {
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  await dialog
    .getByLabel("Vertex color", { exact: true })
    .evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, color);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
async function toggleFill(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  const toggle = dialog.getByRole("switch", {
    name: "Fill interior",
    exact: true,
  });
  const previous = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    previous === "true" ? "false" : "true",
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}

async function graphOption(
  page: Page,
  name: "pedantic" | "finished",
  enabled?: boolean,
): Promise<void> {
  await goalAction(page, "Options");
  const dialog = page.getByRole("dialog", { name: "Graph options" });
  const toggle = dialog.getByRole("switch", { name, exact: true });
  if (enabled === undefined) await toggle.click();
  else await expect(toggle).toHaveAttribute("aria-checked", String(enabled));
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
async function parentOf(page: Page, id: string): Promise<string | null> {
  return page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).nodes.find(
        (node: { id: string }) => node.id === id,
      ).parentId,
    id,
  );
}
async function reconnect(
  page: Page,
  id: string,
  parentId: string | null,
): Promise<void> {
  const handle = await page.getByTestId(`edge-handle-${id}`).boundingBox();
  const canvas = await page.locator(".graph-svg").boundingBox();
  const parent = parentId
    ? await page.getByTestId(`node-fill-${parentId}`).boundingBox()
    : null;
  if (!handle || !canvas || (parentId && !parent))
    throw new Error("Missing connector");
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    parent ? parent.x + parent.width / 2 : canvas.x + 20,
    parent ? parent.y + parent.height / 2 : canvas.y + 20,
    { steps: 12 },
  );
  await page.mouse.up();
}
test.beforeEach(async ({ page }) => {
  const fixture = apply(
    sampleWorkspace(Date.now()),
    {
      type: "edit",
      id: "project",
      title: "Test project",
      notes: "",
      estimateMinutes: 0,
    },
    Date.now(),
  );
  await page.addInitScript((state) => {
    if (localStorage.getItem("hyperforest.panel-position") === null)
      localStorage.setItem("hyperforest.panel-position", "top");
    localStorage.setItem("hyperforest.tutorial.web.v1", "seen");
    localStorage.setItem("hyperforest.tutorial.desktop.v1", "seen");
    if (!localStorage.getItem("hyperforest.workspace.v1"))
      localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
  }, fixture);
});

for (const desktop of [false, true]) {
  test(`creation enters edit mode and marks nonblank notes (${desktop ? "desktop" : "web"})`, async ({
    page,
  }) => {
    if (desktop) await installDesktopMock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./");
    if (desktop) {
      await page
        .getByRole("button", { name: "Choose directory", exact: true })
        .click();
      await page
        .getByRole("button", { name: "New hypertree", exact: true })
        .click();
      await page.getByLabel("Hypertree name").fill("Test project");
      await page
        .getByRole("button", { name: "Create hypertree", exact: true })
        .click();
    }
    const add = page.getByRole("button", {
      name: "Create vanilla vertex",
      exact: true,
    });
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveCount(
      1,
    );
    await page.getByLabel("Goal name", { exact: true }).fill("Quick goal");
    await page
      .getByRole("button", { name: "Create vertex", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select Quick goal", exact: true })
      .click();
    await expect(page.locator(".inspector h2")).toHaveText("Quick goal");
    await expect(page.locator(".inspector")).toHaveAttribute(
      "data-editing",
      "true",
    );
    await add.click();
    await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveCount(
      1,
    );
    await page.keyboard.press("Escape");
    const vertex = page.locator(".goal").filter({
      has: page.getByRole("button", { name: "Select Quick goal", exact: true }),
    });
    const badge = vertex.getByRole("img", { name: "Has notes", exact: true });
    const saveNotes = async (value: string): Promise<void> => {
      await page
        .getByRole("button", { name: "Edit goal", exact: true })
        .click();
      await page.getByLabel("Markdown notes", { exact: true }).fill(value);
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    await expect(badge).toHaveCount(0);
    await saveNotes("# A useful note");
    await expect(badge).toBeVisible();
    await page.reload();
    await expect(badge).toBeVisible();
    await vertex
      .getByRole("button", { name: "Select Quick goal", exact: true })
      .click();
    await saveNotes(" \n\t ");
    await expect(badge).toHaveCount(0);
    await saveNotes("Another note");
    await expect(badge).toBeVisible();
    await saveNotes("");
    await expect(badge).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("simple filled vertices and selection controls survive mode and selection changes", async ({
  page,
}) => {
  await page.goto("./");
  const menu = page.locator(".inspector");
  const check = async (): Promise<void> => {
    await expect(
      menu.getByRole("button", { name: "Focus", exact: true }),
    ).toBeVisible();
    await expect(
      menu.getByRole("button", { name: "Edit goal", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".goal [role=button]")).toHaveCount(9);
    await expect(
      page.locator(
        ".goal .node-play, .goal .node-notes, .goal .node-add, .goal .node-color-button",
      ),
    ).toHaveCount(0);
  };
  await check();
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    DEFAULT_COLORS[1] ?? "",
  );
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute("r", "18");
  await expect(
    page.getByTestId("node-read").locator(".node-title"),
  ).toHaveAttribute("fill", "#ffffff");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await check();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await check();
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  await check();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Choose vertex color" });
  for (const [index, color] of DEFAULT_COLORS.entries()) {
    const swatch = picker.getByRole("button", {
      name: `Default color ${index + 1}`,
      exact: true,
    });
    await expect(swatch).toHaveText(String(index + 1));
    await expect(swatch).toHaveAttribute("title", color);
  }
  await picker
    .getByRole("button", { name: "Default color 3", exact: true })
    .click();
  await expect(page.getByTestId("node-fill-discover")).toHaveAttribute(
    "fill",
    DEFAULT_COLORS[2] ?? "",
  );
  await expect(
    page.getByTestId("node-discover").locator(".node-title"),
  ).toHaveAttribute("fill", "#ffffff");
  await picker.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await check();
});

test("pedantic explains the definition and rejects disconnected color groups", async ({
  page,
}) => {
  await page.goto("./");
  const toggle = page.getByRole("switch", { name: "pedantic", exact: true });
  await goalAction(page, "Options");
  await toggle.hover();
  await expect(page.getByRole("tooltip")).toContainText("connected subtree");
  await expect(page.getByRole("tooltip")).toContainText(/separate hypertrees/);
  await toggle.click();
  await page
    .getByRole("dialog", { name: "Graph options" })
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await graphOption(page, "pedantic", true);
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const color = async (name: string): Promise<void> => {
    await page
      .getByRole("button", { name: `Select ${name}`, exact: true })
      .click();
    await chooseColor(page, "#aabbcc");
  };
  await color("Read & wonder");
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await color("Ask good questions");
  await expect(page.getByRole("alert")).toContainText("connected subtree");
  await expect(page.getByTestId("node-fill-ask")).toHaveAttribute(
    "stroke",
    "#80c9bc",
  );
  await color("Discover");
  await expect(page.getByTestId("node-fill-discover")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await color("Ask good questions");
  await expect(page.getByTestId("node-fill-ask")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await reconnect(page, "read", "create");
  await expect(page.getByRole("alert")).toContainText("connected subtree");
  expect(await parentOf(page, "read")).toBe("discover");
  await toggleFill(page);
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    "#101820",
  );
  await toggleFill(page);
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "fill",
    "#aabbcc",
  );
  await expect(page.getByTestId("node-fill-read")).toHaveAttribute(
    "stroke",
    "#aabbcc",
  );
  await graphOption(page, "pedantic", true);
  await page.reload();
  await graphOption(page, "pedantic", true);
});

test("the compact top menu renames nodes and forest roots directly", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Rename selected vertex", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("Read papers");
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .press("Enter");
  await expect(page.locator(".inspector h2")).toHaveText("Read papers");
  await expect(
    page.getByRole("button", { name: "Select Read papers", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("Cancelled");
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .press("Escape");
  await expect(page.locator(".inspector h2")).toHaveText("Read papers");
  await page
    .getByRole("button", { name: "Select Test project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rename selected vertex", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Vertex name", exact: true })
    .fill("My forest");
  await page
    .getByRole("button", { name: "Save vertex name", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /My forest/ })).toBeVisible();
  await page.reload();
  await expect(page.locator(".inspector h2")).toHaveText("My forest");
  await expect(
    page.getByRole("button", { name: "Select Read papers", exact: true }),
  ).toBeVisible();
});

test("vertices reach both canvas edges and the top menu changes color", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const canvas = await page.locator(".graph-svg").boundingBox();
  if (!canvas) throw new Error("Missing canvas");
  const body = page.getByTestId("node-fill-project");
  for (const x of [canvas.x + 70, canvas.x + canvas.width - 70]) {
    const source = await body.boundingBox();
    if (!source) throw new Error("Missing node");
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(x, canvas.y + canvas.height * 0.3, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const box = await body.boundingBox();
        return box ? Math.abs(box.x + box.width / 2 - x) : Infinity;
      })
      .toBeLessThan(3);
  }
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  await dialog
    .getByLabel("Vertex color")
    .evaluate((input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "#7c83ff");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(body).toHaveAttribute("fill", "#7c83ff");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const moved = await page
    .getByTestId("node-project")
    .getAttribute("transform");
  await page.reload();
  await expect(page.getByTestId("node-project")).toHaveAttribute(
    "transform",
    moved ?? "",
  );
  await expect(body).toHaveAttribute("fill", "#7c83ff");
  await expect(
    page.getByRole("button", { name: "Vertex color", exact: true }),
  ).toHaveCount(0);
});

test("hyperforest supports isolated colored vertices, notes and a full-width canvas", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page).toHaveTitle(/hyperforest/);
  await expect(
    page.getByRole("button", { name: "Create vanilla vertex", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Independent");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Independent", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("Independent");
  const independentId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).nodes.find(
        (node: { title: string }) => node.title === "Independent",
      ).id,
  );
  await reconnect(page, independentId, null);
  await chooseColor(page, "#ef6a75");
  const isolated = page.locator(".goal").filter({
    has: page.getByRole("button", {
      name: "Select Independent",
      exact: true,
    }),
  });
  await expect(isolated.locator('[data-testid^="node-fill-"]')).toHaveAttribute(
    "fill",
    "#ef6a75",
  );
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await openNotes(page, "Independent");
  await expect(page.getByLabel("Goal name", { exact: true })).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Markdown notes" })
    .fill("# Independent notes\nA new direction.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const canvas = await page.locator(".map-panel").boundingBox();
  const details = await page.locator(".inspector").boundingBox();
  if (!canvas || !details) throw new Error("Missing layout");
  expect(Math.abs(canvas.width - details.width)).toBeLessThan(2);
  expect(details.y + details.height).toBeLessThanOrEqual(canvas.y + 1);
  expect(details.height).toBe(112);
  await page.reload();
  await expect(isolated.locator('[data-testid^="node-fill-"]')).toHaveAttribute(
    "fill",
    "#ef6a75",
  );
  await openNotes(page, "Independent");
  await expect(
    page.getByRole("textbox", { name: "Markdown notes" }),
  ).toHaveValue("# Independent notes\nA new direction.");
});

test("edit toggle gates dragging, reconnecting, disconnecting and node plus buttons", async ({
  page,
}) => {
  await page.goto("./");
  const read = page.getByTestId("node-read");
  const before = await read.getAttribute("transform");
  const circle = await read.locator("circle").first().boundingBox();
  if (!circle) throw new Error("Missing node");
  await page.mouse.move(
    circle.x + circle.width / 2,
    circle.y + circle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    circle.x + circle.width / 2 + 60,
    circle.y + circle.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(read).toHaveAttribute("transform", before ?? "");
  await expect(page.getByRole("button", { name: /^Add child to/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Arrange vertices" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const target = await page
    .getByTestId("node-create")
    .locator("circle")
    .first()
    .boundingBox();
  const handle = page.getByTestId("edge-handle-read");
  const start = await handle.boundingBox();
  if (!target || !start) throw new Error("Missing connection");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await expect.poll(() => parentOf(page, "read")).toBe("create");
  const movedHandle = await handle.boundingBox();
  const canvas = await page.locator(".graph-svg").boundingBox();
  if (!movedHandle || !canvas) throw new Error("Missing canvas");
  await page.mouse.move(
    movedHandle.x + movedHandle.width / 2,
    movedHandle.y + movedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(canvas.x + 20, canvas.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await expect.poll(() => parentOf(page, "read")).toBeNull();
  const detachedHandle = await handle.boundingBox();
  const discover = await page
    .getByTestId("node-discover")
    .locator("circle")
    .first()
    .boundingBox();
  if (!detachedHandle || !discover)
    throw new Error("Missing detached connector");
  await page.mouse.move(
    detachedHandle.x + detachedHandle.width / 2,
    detachedHandle.y + detachedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    discover.x + discover.width / 2,
    discover.y + discover.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect.poll(() => parentOf(page, "read")).toBe("discover");
  await reconnect(page, "read", null);
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("A small step");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select A small step", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("A small step");
  await page.getByRole("button", { name: "Done editing", exact: true }).click();
  await expect(page.getByTestId("edge-handle-read")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("edge-read")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select A small step", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit graph", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("new workspaces are empty and roots can move in an expandable graph", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("hyperforest.workspace.v1"),
  );
  await page.goto("./");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("My tree");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const root = page.locator(".root-goal");
  await expect(root).toHaveAttribute("transform", "translate(550 130)");
  const circle = root.getByRole("button", {
    name: "Select My tree",
    exact: true,
  });
  const box = await circle.boundingBox();
  if (!box) throw new Error("Missing root");
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 80);
  await page.mouse.up();
  await expect(root).not.toHaveAttribute("transform", "translate(550 130)");
  await expect(page.locator(".map-heading, .graph-caption")).toHaveCount(0);
  const graph = page.locator(".graph");
  await graph.scrollIntoViewIfNeeded();
  const area = await graph.boundingBox();
  if (!area) throw new Error("Missing graph");
  await page.mouse.move(area.x + area.width - 3, area.y + area.height - 3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 3, area.y + area.height + 150, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await graph.boundingBox())?.height ?? 0)
    .toBeGreaterThan(area.height + 100);
});

test("finishing preserves a child as a ghost, frees its name, and retains parent time", async ({
  page,
}) => {
  await page.goto("./");
  await focusVertex(page, "Read & wonder");
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00");
  await pauseAndMinimize(page);
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  const parentTime = await page
    .locator(".time-stat > :first-child")
    .innerText();
  expect(parentTime).not.toBe("0m");
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await goalAction(page, "Finish goal");
  await page
    .getByRole("dialog", { name: "Finish goal" })
    .getByRole("button", { name: "Finish goal", exact: true })
    .click();
  await expect(page.getByTestId("node-read")).toHaveCount(0);
  await expect(page.locator(".inspector h2")).toHaveText("Discover");
  await expect(page.locator(".time-stat > :first-child")).toHaveText(
    parentTime,
  );
  await expect(page.locator(".focus-dock")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("node-read")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  await expect(page.locator(".time-stat > :first-child")).toHaveText(
    parentTime,
  );
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.locator(".history-list")).toContainText("Read & wonder");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await graphOption(page, "finished");
  await expect(page.getByTestId("node-read")).toHaveClass(/finished-ghost/);
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Focus", exact: true }),
  ).toBeDisabled();
  await page.getByTestId("node-read").getByRole("button").dblclick();
  await expect(page.locator(".focus-screen")).toHaveCount(0);
  await page.reload();
  await graphOption(page, "finished", true);
  await expect(page.getByTestId("node-read")).toHaveClass(/finished-ghost/);
  await page
    .getByRole("button", { name: "Select Discover", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Read & wonder");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select Read & wonder", exact: true }),
  ).toHaveCount(2);
});

test("Ctrl + scroll zooms the graph while ordinary scrolling stays native", async ({
  page,
}) => {
  await page.goto("./");
  const graph = page.locator(".graph-svg");
  const camera = page.locator(".graph-svg > g");
  await graph.hover();
  await page.evaluate(() => {
    document.addEventListener("wheel", (event) => {
      document.documentElement.dataset["wheelPrevented"] = String(
        event.defaultPrevented,
      );
    });
  });
  const original = await camera.getAttribute("transform");
  await page.mouse.wheel(0, 100);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wheel-prevented",
    "false",
  );
  await expect(camera).toHaveAttribute("transform", original ?? "");

  await graph.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await expect(camera).toHaveAttribute("transform", /scale\(1\.1\)/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-wheel-prevented",
    "true",
  );
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await expect(camera).toHaveAttribute("transform", original ?? "");
});

test("drags persist and paused focus survives minimizing and reloading", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page.screenshot({
    path: "/tmp/hyperforest-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  const node = page.getByTestId("node-read");
  const before = await node.getAttribute("transform");
  const body = page.getByRole("button", {
    name: "Select Read & wonder",
    exact: true,
  });
  const box = await body.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Node is missing");
  // Start at the circle, not its text label.
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 70, { steps: 12 });
  await page.mouse.up();
  // The preview can move before the locked workspace transaction has saved it.
  await expect(page.locator(".graph")).not.toHaveClass(/is-dragging/);
  await expect(node).not.toHaveAttribute("transform", before ?? "");
  const moved = await node.getAttribute("transform");
  await page.reload();
  await expect(node).toHaveAttribute("transform", moved ?? "");
  await focusVertex(page, "Read & wonder");
  await expect(
    page.getByRole("dialog", { name: "Focus session" }),
  ).toBeVisible();
  await expect(page.locator(".focus-screen")).toBeVisible();
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00", {
    timeout: 5000,
  });
  await page.screenshot({ path: "/tmp/hyperforest-focus.png", fullPage: true });
  await pauseAndMinimize(page);
  await expect(page.getByRole("dialog", { name: "Focus session" })).toHaveCount(
    0,
  );
  await expect(page.locator(".focus-dock")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Focus session" }),
  ).toContainText("Paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".focus-screen")).toBeVisible();
  await page
    .getByRole("button", { name: "Save & finish", exact: true })
    .click();
  await expect(page.locator(".focus-dock")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.locator(".history-list")).toContainText("Read & wonder");
  expect(errors).toEqual([]);
});

test("creates trees and children, edits markdown, and restores them on reload", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New hypertree" }).click();
  await page.getByLabel("Hypertree name").fill("Thesis");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /Thesis/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Research");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Research", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("Research");
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown notes" })
    .fill("# Research\nA question worth asking.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit goal and notes" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: /Thesis/ }).click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Research", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown notes" }),
  ).toHaveValue("# Research\nA question worth asking.");
});

test("fits on mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.screenshot({
    path: "/tmp/hyperforest-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await focusVertex(page, "Create");
  await pauseAndMinimize(page);
  await expect(page.locator(".focus-dock")).toBeVisible();
});

test("duplicate isolated vertices show a visible error without changing saved data", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Independent");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Independent");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create vanilla vertex" });
  await expect(dialog.getByRole("alert")).toContainText(
    "Sibling names must be unique",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("tab", { name: /Test project/ })).toContainText(
    "10",
  );
});

test("double click focuses a vertex in normal and edit modes", async ({
  page,
}) => {
  await page.goto("./");
  const vertex = page.getByRole("button", {
    name: "Select Read & wonder",
    exact: true,
  });
  await vertex.click();
  await expect(page.locator(".focus-screen")).toHaveCount(0);
  await vertex.dblclick();
  await expect(page.locator(".focus-screen")).toBeVisible();
  await pauseAndMinimize(page);
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await vertex.dblclick();
  await expect(page.locator(".focus-screen")).toBeVisible();
});

test("clear local data requires confirmation and stays empty after reload", async ({
  page,
}) => {
  await page.goto("./");
  await focusVertex(page, "Read & wonder");
  await pauseAndMinimize(page);
  await page.evaluate(() => {
    localStorage.setItem("unrelated-data", "keep");
  });
  await expect(
    page.getByRole("button", { name: "Clear local data", exact: true }),
  ).toBeHidden();
  const before = await page.evaluate(() =>
    localStorage.getItem("hyperforest.workspace.v1"),
  );
  await page.getByLabel("Workspace actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Clear local data", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Clear local data",
    exact: true,
  });
  await expect(confirmation).toContainText("Export a backup first");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("hyperforest.workspace.v1")),
  ).toBe(before);
  await page.getByLabel("Workspace actions", { exact: true }).click();
  await page
    .getByRole("button", { name: "Clear local data", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Delete all local data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Every hypertree starts with one idea.",
    }),
  ).toBeVisible();
  await expect(page.locator(".focus-dock")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("unrelated-data")),
  ).toBe("keep");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Every hypertree starts with one idea.",
    }),
  ).toBeVisible();
});

test("export downloads directly without an app dialog", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("./");
  const download = page.waitForEvent("download");
  await workspaceAction(page, "Export");
  expect((await download).suggestedFilename()).toBe("hyperforest-export.zip");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("export writes a backup through the browser Save As API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async (options: { suggestedName: string }) =>
        (await navigator.storage.getDirectory()).getFileHandle(
          options.suggestedName,
          { create: true },
        ),
    }),
  );
  await page.goto("./");
  await workspaceAction(page, "Export");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        try {
          const file = await (
            await (
              await navigator.storage.getDirectory()
            ).getFileHandle("hyperforest-export.zip")
          ).getFile();
          return Array.from(
            new Uint8Array(await file.arrayBuffer()).slice(0, 2),
          );
        } catch {
          return [];
        }
      }),
    )
    .toEqual([80, 75]);
});

test("focus title and global Today update while running and freeze while paused", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Focus", exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await focusVertex(page, "Read & wonder");
  await expect(page).toHaveTitle("00:00:00 — hyperforest");
  await page.clock.runFor(1000);
  await expect(page).toHaveTitle("00:00:01 — hyperforest");
  await page.clock.runFor(1000);
  await expect(page).toHaveTitle("00:00:02 — hyperforest");
  await expect(page.getByTestId("today-time")).toHaveText(/Today\s*0h 0m/);
  await pauseAndMinimize(page);
  await expect(page).toHaveTitle("Paused · 00:00:02 — hyperforest");
  await page.clock.runFor(2000);
  await expect(page).toHaveTitle("Paused · 00:00:02 — hyperforest");
});

test("graph options preserve pedantic settings and edge dragging enforces connectivity", async ({
  page,
}) => {
  await page.goto("./");
  await graphOption(page, "pedantic", false);
  await graphOption(page, "pedantic");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await reconnect(page, "read", null);
  await expect(page.getByRole("alert")).toContainText("must be connected");
  expect(await parentOf(page, "read")).toBe("discover");
  await page.reload();
  await graphOption(page, "pedantic", true);
  await expect(page.getByLabel("Parent connection")).toHaveCount(0);
});

test("multiple colors render, persist, and can return to a single color", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Choose vertex color" });
  const multiple = dialog.getByRole("switch", {
    name: "Multiple colors",
    exact: true,
  });
  await multiple.click();
  await expect(multiple).toHaveAttribute("aria-checked", "true");
  await dialog
    .getByRole("button", { name: "Default color 2", exact: true })
    .click();
  await expect(
    page.getByTestId("node-colors-project").locator("path"),
  ).toHaveCount(2);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(
    page.getByTestId("node-colors-project").locator("path"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page.getByRole("button", { name: "Vertex color", exact: true }).click();
  await expect(multiple).toHaveAttribute("aria-checked", "true");
  await dialog
    .getByRole("switch", { name: "Fill interior", exact: true })
    .click();
  await expect(
    page.getByTestId("node-colors-project").locator("path").first(),
  ).toHaveAttribute("fill", "none");
  await multiple.click();
  await expect(multiple).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("node-colors-project")).toHaveCount(0);
});

test("adds another hypertree as a persistent live vertex", async ({ page }) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("Linked project");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Link another hypertree").selectOption("project");
  await expect(page.getByLabel("Goal name", { exact: true })).toHaveValue(
    "Test project",
  );
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText("Linked project");
  await expect(
    page.getByRole("img", { name: "Link to another hypertree" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /Linked project/ }).click();
  await expect(
    page.getByRole("button", { name: "Select Test project", exact: true }),
  ).toBeVisible();
  const linked = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).nodes.find(
      (node: { linkedTreeId?: string }) => node.linkedTreeId === "project",
    ),
  );
  expect(linked).toBeTruthy();
});

test("reorders tabs and routes linked focus to its source root", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page.getByLabel("Hypertree name").fill("Container");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rearrange tabs", exact: true }),
  ).toBeHidden();
  await expect(
    page
      .getByRole("tablist")
      .getByRole("button", { name: "New hypertree", exact: true }),
  ).toHaveCount(0);
  await workspaceAction(page, "Rearrange tabs");
  await page
    .getByRole("button", { name: "Move Container earlier", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("tab").first()).toContainText("Container");
  await page.reload();
  await expect(page.getByRole("tab").first()).toContainText("Container");
  await page.getByRole("tab", { name: /Container/ }).click();
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await page.getByLabel("Link another hypertree").selectOption("project");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select Test project", exact: true })
    .click();
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).focus
            ?.nodeId,
      ),
    )
    .toBe("project");
  await pauseAndMinimize(page);
});

test("export includes the current YAML workspace, structure report, and notes", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("./");
  const downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await workspaceAction(page, "Export");
  await expect.poll(() => downloads).toEqual(["hyperforest-export.zip"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("session history combines date and subject filters and can clear them", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!);
    state.sessions = [
      {
        id: "old",
        title: "Reading",
        group: "Research",
        startedAt: new Date(2026, 9, 6, 12).getTime(),
      },
      {
        id: "today-read",
        title: "Reading",
        group: "Research",
        startedAt: new Date(2026, 9, 7, 12).getTime(),
      },
      {
        id: "today-write",
        title: "Writing",
        group: "Thesis",
        startedAt: new Date(2026, 9, 7, 13).getTime(),
      },
    ].map((session) => ({
      ...session,
      treeId: "project",
      nodeId: "read",
      endedAt: session.startedAt + 60000,
      durationMs: 60000,
      periods: [{ start: session.startedAt, end: session.startedAt + 60000 }],
    }));
    localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
  });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  const history = page.locator(".history-list tbody tr");
  await expect(history).toHaveCount(3);
  await page.getByLabel("From date", { exact: true }).fill("2026-10-07");
  await page.getByLabel("To date", { exact: true }).fill("2026-10-07");
  await expect(history).toHaveCount(2);
  await page.getByLabel("Subject", { exact: true }).fill("research");
  await expect(history).toHaveCount(1);
  await expect(history).toContainText("Reading");
  await page.getByLabel("Subject", { exact: true }).fill("no match");
  await expect(
    page.getByText("No sessions match these filters.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(history).toHaveCount(3);
});

test("Today is a global counter and the history icon to its right opens history", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Focus", exact: true }),
  ).toBeVisible();
  await page.clock.install();
  await focusVertex(page, "Read & wonder");
  await page.clock.runFor(63000);
  await pauseAndMinimize(page);
  const today = page.getByTestId("today-time");
  const pausedToday = await today.locator(".today-counter").innerText();
  expect(pausedToday).toContain("0h 1m");
  await page
    .getByRole("button", { name: "Select Test project", exact: true })
    .click();
  await expect(today.locator(".today-counter")).toHaveText(pausedToday);
  await expect(page.locator("header").getByTestId("today-time")).toBeVisible();
  await today.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const historyButton = page.getByRole("button", {
    name: "Session history",
    exact: true,
  });
  const todayBox = await today.boundingBox();
  const historyBox = await historyButton.boundingBox();
  expect(historyBox!.x).toBeGreaterThan(todayBox!.x + todayBox!.width);
  await historyButton.click();
  await expect(
    page.getByRole("dialog", { name: "Session history" }),
  ).toBeVisible();
  await expect(page.getByLabel("From date", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("To date", { exact: true })).toHaveValue("");
});

test("change history adds a persistent session and confirms deletion", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change history", exact: true })
    .click();
  await page.getByRole("button", { name: "Add session", exact: true }).click();
  await page
    .getByLabel("Session subject", { exact: true })
    .selectOption("read");
  await page.getByLabel("Minutes", { exact: true }).fill("1");
  await page.getByLabel("Seconds", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save session", exact: true }).click();
  await expect(page.locator(".manual-session")).toHaveCount(0);
  await expect(page.locator(".history-list tbody tr")).toHaveCount(1);
  await expect(page.locator(".history-list")).toContainText("Read & wonder");
  await page.reload();
  await expect(page.locator(".today-counter")).toHaveText("0h 1m");
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.locator(".history-list tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Change history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete session Read & wonder", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".history-list tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete session Read & wonder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm delete", exact: true })
    .click();
  await expect(page.locator(".history-list tbody tr")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".today-counter")).toHaveText("0h 0m");
});

test("vanilla creation connects to the selection and restores its parent", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  await expect(page.getByLabel("Parent connection")).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "pedantic", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveCount(
    1,
  );
  await page.getByLabel("Goal name", { exact: true }).fill("Independent");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const id = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!).nodes.find(
        (node: { title: string }) => node.title === "Independent",
      ).id,
  );
  expect(await parentOf(page, id)).toBe("project");
  await expect(page.locator(".inspector h2")).toHaveText("Test project");
  await expect(page.getByTestId(`edge-${id}`)).toHaveCount(1);
  await reconnect(page, id, "discover");
  await expect.poll(() => parentOf(page, id)).toBe("discover");
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveCount(
    1,
  );
});

test("options open directly and finish/delete follow vertex color only in edit mode", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Vertex color", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Finish goal", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete hypertree", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Goal actions", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Options", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Graph options" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "finished", exact: true }),
  ).toHaveAccessibleDescription(/notes and focus time/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit graph", exact: true }).click();
  expect(
    (await page.locator(".vertex-action-tools button").allTextContents()).map(
      (text) => text.trim(),
    ),
  ).toEqual(["Vertex color", "Finish subgoal", "Delete hypertree"]);
  await expect(
    page.getByRole("button", { name: "Finish goal", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Select Read & wonder", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish goal", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Delete subtree", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Workspace actions", { exact: true }).click();
  await expect(
    page
      .locator(".action-menu-items")
      .getByRole("button", { name: "Session history", exact: true }),
  ).toHaveCount(0);
});

test("pedantic and finished show separate explanations only on hover or keyboard focus", async ({
  page,
}) => {
  await page.goto("./");
  await goalAction(page, "Options");
  const pedantic = page.getByRole("switch", { name: "pedantic", exact: true });
  const finished = page.getByRole("switch", { name: "finished", exact: true });
  await expect(page.locator("#pedantic-definition")).toBeHidden();
  await expect(page.locator("#finished-explanation")).toBeHidden();
  await pedantic.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toContainText("connected subtree");
  await finished.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toContainText("translucent ghosts");
  await expect(page.locator("#pedantic-definition")).toBeHidden();
  await page.getByRole("heading", { name: "Options", exact: true }).hover();
  await expect(page.locator("#finished-explanation")).toBeHidden();
});

test("desktop uses selected YAML and Markdown storage rather than browser workspace data", async ({
  page,
}) => {
  await installDesktopMock(page);
  await page.goto("./");
  await page
    .getByRole("button", { name: "Zoom interface in", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.zoom")))
    .toBe("1.1");
  await page.keyboard.press("Control+-");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.zoom")))
    .toBe("1");
  await page.keyboard.press("Control+=");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.zoom")))
    .toBe("1.1");
  await page.evaluate(() => localStorage.removeItem("test.zoom"));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reset interface zoom", exact: true }),
  ).toHaveText("110%");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.zoom")))
    .toBe("1.1");
  await page.keyboard.press("Control+0");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.zoom")))
    .toBe("1");
  await page
    .getByRole("button", { name: "Choose directory", exact: true })
    .click();
  const status = page.getByLabel("Autosaved", { exact: true });
  await expect(status).toBeVisible();
  await expect(page.locator(".desktop-storage")).toHaveCount(0);
  await expect(
    page.getByText("Saved in data directory", { exact: true }),
  ).toHaveCount(0);
  const tooltip = page.locator(".save-details-tooltip");
  const panel = page.locator(".desktop-save-status .action-menu-items");
  await page.getByRole("link", { name: "hyperforest home" }).hover();
  await expect(tooltip).toBeHidden();
  await expect(panel).toBeHidden();
  await status.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(
    "Data directory: /tmp/hyperforest-desktop-test",
  );
  await expect(tooltip).toContainText("Last saved:");
  await page.getByRole("link", { name: "hyperforest home" }).hover();
  await expect(tooltip).toBeHidden();
  await status.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByRole("button", { name: "Change directory", exact: true }),
  ).toBeVisible();
  await expect(tooltip).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Zoom interface in", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  const bar = page.locator(".desktop-status-bar");
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(44);
  await bar
    .getByRole("button", { name: "Zoom interface in", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await bar
    .getByRole("button", { name: "Reset interface zoom", exact: true })
    .click();
  await status.click();
  await page.evaluate(() => localStorage.setItem("test.fail-save", "yes"));
  await panel.getByRole("button", { name: "Back up now", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Disk is full");
  await page.getByLabel("Needs attention", { exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("test.fail-save"));
  await panel.getByRole("button", { name: "Back up now", exact: true }).click();
  await expect(status).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select Test project", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "New hypertree", exact: true })
    .click();
  await page
    .getByLabel("Hypertree name", { exact: true })
    .fill("Desktop project");
  await page
    .getByRole("button", { name: "Create hypertree", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await page
    .getByLabel("Markdown notes", { exact: true })
    .fill("# Actual Markdown\nSaved separately.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit goal and notes", exact: true }),
  ).toHaveCount(0);
  const files = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test.desktop.files")!),
  );
  expect(files.yaml).toContain("notesFile:");
  expect(files.yaml).not.toContain("Saved separately.");
  expect(Object.values(files.notes)).toContain(
    "# Actual Markdown\nSaved separately.",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Select Desktop project", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await page
    .getByLabel("Markdown notes", { exact: true })
    .fill("# Draft saved before opening");
  await page
    .getByRole("button", { name: "Open Markdown file", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.opened-note")))
    .toBe("yes");
  const reopened = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test.desktop.files")!),
  );
  expect(Object.values(reopened.notes)).toContain(
    "# Draft saved before opening",
  );
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test.tray-state")!).running,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { testTrayAction: (action: string) => void }
    ).testTrayAction("toggle-focus"),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test.tray-state")!).paused,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { testTrayAction: (action: string) => void }
    ).testTrayAction("toggle-focus"),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("test.tray-state")!).running,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { testTrayAction: (action: string) => void }
    ).testTrayAction("quit"),
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.quit")))
    .toBe("yes");
});

test("Space toggles focus without repeating or hijacking controls and note typing", async ({
  page,
}) => {
  await page.goto("./");
  await focusVertex(page, "Read & wonder");
  const screen = page.getByRole("dialog", { name: "Focus session" });
  await expect(screen).toBeFocused();
  await page.keyboard.press("Space");
  await expect(screen).toHaveAttribute("data-running", "false");
  await expect(screen).toBeVisible();
  await page.keyboard.press("Space");
  await expect(screen).toHaveAttribute("data-running", "true");
  await page.keyboard.down("Space");
  await expect(screen).toHaveAttribute("data-running", "false");
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(screen).toHaveAttribute("data-running", "false");
  await page.keyboard.press("Control+Space");
  await expect(screen).toHaveAttribute("data-running", "false");
  const resume = page.getByRole("button", { name: "Resume", exact: true });
  await resume.focus();
  await page.keyboard.press("Space");
  await expect(screen).toHaveAttribute("data-running", "true");
  const beforeMinimize = await page.evaluate(() =>
    localStorage.getItem("hyperforest.workspace.v1"),
  );
  await page.getByRole("button", { name: "Minimize", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".focus-dock")).toHaveAttribute(
    "data-running",
    "true",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("hyperforest.workspace.v1")),
  ).toBe(beforeMinimize);
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  const notes = page.getByRole("textbox", { name: "Markdown notes" });
  await notes.fill("A note");
  await notes.press("Space");
  await expect(notes).toHaveValue("A note ");
  expect(
    await page.evaluate(() => localStorage.getItem("hyperforest.workspace.v1")),
  ).toBe(beforeMinimize);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect(screen).toBeFocused();
  await page.keyboard.press("Space");
  await expect(screen).toHaveAttribute("data-running", "false");
});

for (const width of [1440, 800, 390]) {
  test(`focus presentation preserves accounting and fits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 650 });
    await page.goto("./");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const brand = await page.locator(".brand").boundingBox();
    const today = page.locator(".brand-today").getByTestId("today-time");
    const todayBox = await today.boundingBox();
    expect(brand!.x + brand!.width).toBeLessThan(todayBox!.x);
    expect(
      Math.abs(
        brand!.y + brand!.height / 2 - todayBox!.y - todayBox!.height / 2,
      ),
    ).toBeLessThan(2);
    await expect(today.locator(".today-counter")).toHaveCSS(
      "font-size",
      "24px",
    );
    await expect(today).toHaveText(/Today\s*0h 0m/);
    const actions = page.locator(".selection-actions");
    const controls = actions.locator(
      ":scope > button, :scope > details > summary",
    );
    const boxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    for (const [index, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      for (const other of boxes.slice(index + 1)) {
        expect(
          box.x + box.width <= other.x + 1 ||
            other.x + other.width <= box.x + 1 ||
            box.y + box.height <= other.y + 1 ||
            other.y + other.height <= box.y + 1,
        ).toBe(true);
      }
    }
    const now = new Date();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await focusVertex(page, "Read & wonder");
    await page.clock.runFor(2000);
    const timer = page.getByTestId("focus-timer");
    const position = await timer.boundingBox();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Focus session" }),
    ).toBeVisible();
    await expect(page.locator(".focus-status")).toHaveText("Paused");
    expect(await timer.boundingBox()).toEqual(position);
    await page.clock.runFor(10000);
    await expect(timer).toHaveText("00:00:02");
    const paused = await page.evaluate(() =>
      localStorage.getItem("hyperforest.workspace.v1"),
    );
    await page.getByRole("button", { name: "Minimize", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Focus timer" }),
    ).toContainText("Paused");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.workspace.v1"),
      ),
    ).toBe(paused);
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(page.locator(".focus-dock")).toHaveAttribute(
      "data-running",
      "true",
    );
    await expect(
      page.getByRole("dialog", { name: "Focus session" }),
    ).toHaveCount(0);
    await page.clock.runFor(3000);
    await expect(page.locator(".focus-dock")).toContainText("00:00:05");
    const running = await page.evaluate(() =>
      localStorage.getItem("hyperforest.workspace.v1"),
    );
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    await expect(timer).toHaveText("00:00:05");
    expect(await timer.boundingBox()).toEqual(position);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.workspace.v1"),
      ),
    ).toBe(running);
    await page.keyboard.press("Escape");
    await expect(page.locator(".focus-dock")).toHaveAttribute(
      "data-running",
      "true",
    );
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.workspace.v1"),
      ),
    ).toBe(running);
    await page.getByLabel("Session actions", { exact: true }).click();
    await page
      .getByRole("button", { name: "Save & finish", exact: true })
      .click();
    await expect(page.locator(".focus-dock")).toHaveCount(0);
    const state = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!),
    );
    expect(state.sessions[0].durationMs).toBe(5000);
    expect(state.focus).toBeNull();
  });
}

test("dense graph navigation restores labels and connections after the gesture", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!);
    const template = state.nodes.find(
      (node: { id: string }) => node.id === "read",
    );
    for (let i = 0; i < 151; i++)
      state.nodes.push({
        ...template,
        id: `dense-${i}`,
        parentId: "project",
        title: `Dense ${i}`,
        x: 50 + (i % 15) * 60,
        y: 180 + Math.floor(i / 15) * 40,
      });
    localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
  });
  await page.goto("./");
  const graph = page.locator(".graph");
  const edge = page.getByTestId("edge-read");
  const label = page.getByTestId("node-read").locator(".node-title");
  await expect(edge).toBeVisible();
  await page
    .locator(".graph-svg")
    .dispatchEvent("wheel", { ctrlKey: true, deltaY: -40 });
  await expect(graph).toHaveClass(/is-navigating/);
  await expect(edge).toBeHidden();
  await expect(label).toBeHidden();
  await expect(edge).toBeVisible();
  await expect(label).toBeVisible();
});

test("history handles a large ledger with Rust statistics, pagination, and isolated scrolling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!);
    state.sessions = Array.from({ length: 1205 }, (_, index) => {
      const start = new Date(2026, 9, 1, 0, index).getTime();
      return {
        id: `ledger-${index}`,
        treeId: "project",
        nodeId: "read",
        title: `Reading ${index}`,
        group: "Research",
        startedAt: start,
        endedAt: start + 60000,
        durationMs: 60000,
        periods: [{ start, end: start + 60000 }],
      };
    });
    localStorage.setItem("hyperforest.workspace.v1", JSON.stringify(state));
  });
  await page.goto("./");
  await page.addStyleTag({ content: "body { min-height: 2000px; }" });
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Session history",
    exact: true,
  });
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(1000);
  const history = dialog.locator(".history-list tbody tr");
  await expect(history).toHaveCount(100);
  await expect(history.first()).toContainText("Reading 1204");
  await dialog.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await dialog.getByLabel("To date", { exact: true }).fill("2026-10-03");
  const metric = (name: string) =>
    dialog
      .locator(".history-statistics > div")
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator("dd");
  await expect(metric("Total focus")).toHaveText("20h 5m");
  await expect(metric("Average per day")).toHaveText("6h 41m");
  await expect(metric("Active days")).toHaveText("1");
  await expect(metric("Calendar days")).toHaveText("3");
  await expect(metric("Sessions")).toHaveText("1205");
  await expect(metric("Average session")).toHaveText("1m");
  await expect(metric("Longest session")).toHaveText("1m");
  const previousY = await page.evaluate(() => window.scrollY);
  const scroll = dialog.locator(".history-scroll");
  await scroll.hover();
  await page.mouse.wheel(0, 50000);
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.mouse.wheel(0, 50000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(previousY);
  await dialog.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(history.first()).toContainText("Reading 1104");
  await dialog.getByLabel("Subject", { exact: true }).fill("Reading 1204");
  await expect(history).toHaveCount(1);
  await expect(metric("Sessions")).toHaveText("1");
  await expect(
    dialog.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

for (const width of [800, 390]) {
  test(`history fits independently at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("./");
    await page
      .getByRole("button", { name: "Session history", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Session history",
      exact: true,
    });
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(width - 30);
    await expect(dialog.locator(".history-pagination")).toBeInViewport();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

test("date calendars reopen consistently, switch fields, respect limits, and close without closing history", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  const history = page.getByRole("dialog", {
    name: "Session history",
    exact: true,
  });
  const fromButton = history.getByRole("button", {
    name: "Choose from date",
    exact: true,
  });
  const toButton = history.getByRole("button", {
    name: "Choose to date",
    exact: true,
  });
  const from = history.getByRole("dialog", {
    name: "From date calendar",
    exact: true,
  });
  const to = history.getByRole("dialog", {
    name: "To date calendar",
    exact: true,
  });
  for (let i = 0; i < 4; i++) {
    await fromButton.click();
    await expect(from).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(from).toHaveCount(0);
    await expect(history).toBeVisible();
    await expect(fromButton).toBeFocused();
  }
  await fromButton.click();
  await toButton.click();
  await expect(from).toHaveCount(0);
  await expect(to).toBeVisible();
  await toButton.click();
  await expect(to).toHaveCount(0);
  await history.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await history.getByLabel("To date", { exact: true }).fill("2026-10-07");
  await fromButton.click();
  await expect(
    from.getByRole("gridcell", { name: "2026-10-08", exact: true }),
  ).toBeDisabled();
  await from.getByRole("gridcell", { name: "2026-10-03", exact: true }).click();
  await expect(from).toHaveCount(0);
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "2026-10-03",
  );
  await toButton.click();
  await expect(
    to.getByRole("gridcell", { name: "2026-10-02", exact: true }),
  ).toBeDisabled();
  await history.getByLabel("Subject", { exact: true }).click();
  await expect(to).toHaveCount(0);
  await fromButton.click();
  await page.keyboard.press("ArrowRight");
  await expect(
    from.getByRole("gridcell", { name: "2026-10-04", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "2026-10-04",
  );
  await history
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await history.getByLabel("From date", { exact: true }).fill("2026-02-30");
  await expect(
    history.getByLabel("From date", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(history.getByRole("alert")).toContainText("Enter dates as");
  await history
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(history.getByRole("alert")).toHaveCount(0);
  await history
    .getByRole("button", { name: "Change history", exact: true })
    .click();
  await history
    .getByRole("button", { name: "Add session", exact: true })
    .click();
  await history
    .getByRole("button", { name: "Choose session start date", exact: true })
    .click();
  const manual = history.getByRole("dialog", {
    name: "Session start date calendar",
    exact: true,
  });
  await expect(manual).toBeVisible();
  await manual
    .getByLabel("Calendar year", { exact: true })
    .selectOption("2024");
  await manual.getByLabel("Calendar month", { exact: true }).selectOption("1");
  await manual
    .getByRole("gridcell", { name: "2024-02-29", exact: true })
    .click();
  await expect(
    history.getByLabel("Session start date", { exact: true }),
  ).toHaveValue("2024-02-29");
  await expect(history.locator(".manual-session")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Session history", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 800]) {
  test(`calendar stays visible and clickable in a ${width}px history window`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("./");
    await page
      .getByRole("button", { name: "Session history", exact: true })
      .click();
    const history = page.getByRole("dialog", {
      name: "Session history",
      exact: true,
    });
    await history
      .getByRole("button", { name: "Choose to date", exact: true })
      .click();
    const calendar = history.getByRole("dialog", {
      name: "To date calendar",
      exact: true,
    });
    const box = (await calendar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(700);
    await calendar.getByRole("button", { name: "Today", exact: true }).click();
    await expect(calendar).toHaveCount(0);
    await expect(
      history.getByLabel("To date", { exact: true }),
    ).not.toHaveValue("");
    await history.getByLabel("To date", { exact: true }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(calendar).toBeVisible();
    await calendar
      .getByRole("button", { name: "Clear date", exact: true })
      .click();
    await expect(history.getByLabel("To date", { exact: true })).toHaveValue(
      "",
    );
  });
}

test("history remembers its interval after closing and restarting the interface", async ({
  page,
}) => {
  await page.goto("./");
  const open = () =>
    page.getByRole("button", { name: "Session history", exact: true }).click();
  const history = page.getByRole("dialog", {
    name: "Session history",
    exact: true,
  });
  await open();
  await history.getByLabel("From date", { exact: true }).fill("2026-10-01");
  await history.getByLabel("To date", { exact: true }).fill("2026-10-07");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("hyperforest.history-range")!),
      ),
    )
    .toEqual({ from: "2026-10-01", to: "2026-10-07" });
  await history
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await open();
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  await expect(history.getByLabel("To date", { exact: true })).toHaveValue(
    "2026-10-07",
  );
  await history.getByLabel("From date", { exact: true }).fill("2026-");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("hyperforest.history-range")!),
      ),
    )
    .toEqual({ from: "2026-10-01", to: "2026-10-07" });
  await page.reload();
  await open();
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "2026-10-01",
  );
  await expect(history.getByLabel("To date", { exact: true })).toHaveValue(
    "2026-10-07",
  );
  await history
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.reload();
  await open();
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "",
  );
  await expect(history.getByLabel("To date", { exact: true })).toHaveValue("");
  await page.evaluate(() =>
    localStorage.setItem(
      "hyperforest.history-range",
      '{"from":"2026-02-30","to":"2026-10-07"}',
    ),
  );
  await page.reload();
  await open();
  await expect(history.getByLabel("From date", { exact: true })).toHaveValue(
    "",
  );
  await expect(history.getByRole("alert")).toHaveCount(0);
});

test("desktop imports hiper sessions on opening, creates the fallback tree, and hides the inactive estimate field", async ({
  page,
}) => {
  await installDesktopMock(page, {
    directory: "/tmp/hyperforest-desktop-test",
    yaml: null,
    notes: {},
  });
  await page.addInitScript(() => {
    const id = "c".repeat(32);
    localStorage.setItem(
      "test.hiper-inbox",
      JSON.stringify([
        {
          filename: `${id}.json`,
          contents: JSON.stringify({
            version: 1,
            id,
            title: "CLI task",
            startedAt: 1000,
            endedAt: 6000,
            durationMs: 3000,
            periods: [
              { start: 1000, end: 2000 },
              { start: 4000, end: 6000 },
            ],
          }),
        },
      ]),
    );
  });
  await page.goto("./");
  await expect(page.getByRole("tab", { name: /^hiper / })).toBeVisible();
  await page.getByRole("tab", { name: /^hiper / }).click();
  await page
    .getByRole("button", { name: "Select CLI task", exact: true })
    .click();
  await expect(page.locator(".time-stat")).toContainText("3s");
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(
    page.getByLabel("Markdown notes", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Time estimate", { exact: false })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("test.hiper-inbox")!),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("tab", { name: /^hiper / })).toBeVisible();
  await expect(page.locator(".time-stat")).toContainText("3s");
  await page
    .getByRole("button", { name: "Select CLI task", exact: true })
    .click();
  await expect(page.locator(".time-stat")).toContainText("3s");
  const files = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("test.desktop.files")!) as {
        yaml: string;
      },
  );
  const { parse } = await import("yaml");
  const saved = parse(files.yaml) as {
    sessions: { importedAt: number; startedAt: number; durationMs: number }[];
  };
  expect(saved.sessions).toHaveLength(1);
  expect(saved.sessions[0]).toMatchObject({
    startedAt: 1000,
    durationMs: 3000,
  });
  expect(saved.sessions[0]!.importedAt).toBeGreaterThan(6000);
});

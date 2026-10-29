import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { sampleWorkspace } from "../sampleWorkspace";
import { workspaceFiles } from "../../src/workspaceFiles";
import type { State, VertexKind } from "../../src/model";
import { installDesktopMock } from "./desktopHarness";

async function initialize(page: Page, desktop = false): Promise<void> {
  const state = sampleWorkspace(Date.now());
  await page.addInitScript((state) => {
    if (localStorage.getItem("hyperforest.panel-position") === null)
      localStorage.setItem("hyperforest.panel-position", "top");
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
  await expect(page.locator(".graph")).toBeVisible();
}

async function snapshot(page: Page, desktop = false): Promise<State> {
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
  const { readWorkspace } = await import("../../src/workspaceFiles");
  return readWorkspace(files.yaml, files.notes);
}

async function create(
  page: Page,
  kind: VertexKind,
  title: string,
): Promise<void> {
  await page
    .getByRole("button", { name: "Select A meaningful project", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Create ${kind} vertex`, exact: true })
    .click();
  await expect(
    page.getByLabel(kind === "thought" ? "Thought text" : "Goal name", {
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.type(title);
  await expect(page.getByLabel("Parent vertex", { exact: true })).toHaveCount(
    kind === "thought" ? 0 : 1,
  );
  if (kind === "deadline")
    await page.getByLabel("Deadline", { exact: true }).fill("2035-06-15T12:00");
  if (kind === "reading")
    await page
      .getByLabel("File path or website", { exact: true })
      .fill("https://example.org/paper.pdf");
  if (kind === "habit") {
    await page.getByLabel("Repetitions", { exact: true }).fill("3");
    await page.getByLabel("Frequency", { exact: true }).selectOption("week");
  }
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".inspector h2")).toHaveText(
    "A meaningful project",
  );
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page
    .getByRole("button", { name: `Select ${title}`, exact: true })
    .click();
  if (kind === "thought") await page.keyboard.press("Escape");
  await expect(page.locator(".inspector h2")).toHaveText(title);
  await expect(page.locator(".inspector")).toHaveAttribute(
    "data-editing",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Done editing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
}

for (const desktop of [false, true]) {
  test(`right column creates all five kinds without moving vertices (${desktop ? "desktop" : "web"})`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    const menu = page.getByRole("group", {
      name: "Create a vertex",
      exact: true,
    });
    await expect(menu.getByRole("button")).toHaveCount(5);
    const tools = page.getByRole("navigation", {
      name: "Graph tools",
      exact: true,
    });
    const controls = tools.getByRole("group", {
      name: "Graph controls",
      exact: true,
    });
    await expect(controls.getByRole("button")).toHaveCount(2);
    await expect(controls.getByRole("button").nth(0)).toHaveAccessibleName(
      "Edit graph",
    );
    await expect(controls.getByRole("button").nth(1)).toHaveAccessibleName(
      "Options",
    );
    await expect(tools.getByRole("separator")).toHaveCount(1);
    expect((await controls.boundingBox())!.y).toBeLessThan(
      (await menu.boundingBox())!.y,
    );
    await expect(
      page
        .locator(".selection-actions")
        .getByRole("button", { name: "Edit graph", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator(".selection-actions")
        .getByRole("button", { name: "Options", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New vertex", exact: true }),
    ).toHaveCount(0);
    const canvas = await page.locator(".graph").boundingBox();
    const column = await menu.boundingBox();
    expect(column!.x).toBeGreaterThanOrEqual(canvas!.x + canvas!.width - 1);
    const vanilla = menu.getByRole("button", { name: "Create vanilla vertex" });
    await vanilla.hover();
    await expect(vanilla.locator(".graph-tool-tooltip")).toBeVisible();
    await vanilla.focus();
    await expect(vanilla.locator(".graph-tool-tooltip")).toBeVisible();

    for (const kind of [
      "vanilla",
      "deadline",
      "thought",
      "reading",
      "habit",
    ] as const) {
      const before = await snapshot(page, desktop);
      const transforms = await page.locator(".goal").evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute("data-testid"),
          transform: node.getAttribute("transform"),
        })),
      );
      await create(page, kind, `My ${kind}`);
      const after = await snapshot(page, desktop);
      const added = after.nodes.find((node) => node.title === `My ${kind}`)!;
      expect(added.vertex?.kind).toBe(kind);
      expect(added.parentId).toBe(kind === "thought" ? null : "project");
      await expect(page.getByTestId(`edge-${added.id}`)).toHaveCount(
        kind === "thought" ? 0 : 1,
      );
      expect(
        after.nodes
          .filter((node) => node.id !== added.id)
          .map(({ id, x, y }) => ({ id, x, y })),
      ).toEqual(before.nodes.map(({ id, x, y }) => ({ id, x, y })));
      for (const { id, transform } of transforms)
        await expect(page.getByTestId(id!)).toHaveAttribute(
          "transform",
          transform!,
        );
      await expect(page.getByTestId(`node-${added.id}`)).toHaveAttribute(
        "data-vertex-kind",
        kind,
      );
      if (kind === "thought")
        await expect(
          page.getByTestId(`node-fill-${added.id}`),
        ).toHaveJSProperty("tagName", "path");
      if (kind === "reading")
        await expect(
          page.getByRole(desktop ? "button" : "link", {
            name: desktop ? "Open attachment" : "Open website",
          }),
        ).toBeVisible();
      if (kind === "deadline") {
        const timer = page.getByLabel("Deadline countdown");
        const initial = await timer.textContent();
        await expect.poll(() => timer.textContent()).not.toBe(initial);
      }
      if (kind === "habit") {
        await page.getByRole("button", { name: "Record repetition" }).click();
        await page.getByRole("button", { name: "Record repetition" }).click();
        await expect(page.getByLabel("Habit progress")).toHaveText(
          "2 / 3 this week",
        );
      }
    }
    await page.reload();
    const after = await snapshot(page, desktop);
    expect(
      after.nodes.filter((node) => node.title.startsWith("My ")),
    ).toHaveLength(5);
    await page.getByRole("button", { name: "Fit graph", exact: true }).click();
    await page
      .getByRole("button", { name: "Select My habit", exact: true })
      .click();
    await expect(page.getByLabel("Habit progress")).toHaveText(
      "2 / 3 this week",
    );
    await page.getByRole("button", { name: "Undo last repetition" }).click();
    await expect(page.getByLabel("Habit progress")).toHaveText(
      "1 / 3 this week",
    );
    await page.getByRole("button", { name: "Edit graph", exact: true }).click();
    await page.getByRole("button", { name: "Edit frequency" }).click();
    await page.getByLabel("Repetitions", { exact: true }).fill("4");
    await page.getByLabel("Frequency", { exact: true }).selectOption("month");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByLabel("Habit progress")).toHaveText(
      "1 / 4 this month",
    );
    const graphBounds = await page.locator(".graph").boundingBox();
    for (const body of await page
      .locator(".goal [data-testid^=node-fill]")
      .all()) {
      const bounds = await body.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        graphBounds!.y + graphBounds!.height,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath("vertices.png"),
    });
  });
}

for (const kind of [
  "vanilla",
  "deadline",
  "thought",
  "reading",
  "habit",
] as const) {
  test(`${kind} can focus, drag, reconnect, and retain its kind`, async ({
    page,
  }) => {
    await initialize(page);
    await create(page, kind, "Shared behavior");
    let state = await snapshot(page);
    const node = state.nodes.find((node) => node.title === "Shared behavior")!;
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Focus session", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save & finish", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Done editing", exact: true }),
    ).toBeVisible();
    const body = await page.getByTestId(`node-fill-${node.id}`).boundingBox();
    await page.mouse.move(
      body!.x + body!.width / 2,
      body!.y + body!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      body!.x + body!.width / 2 + 48,
      body!.y + body!.height / 2 + 35,
      { steps: 5 },
    );
    await page.mouse.up();
    await expect(page.locator(".graph")).not.toHaveClass(/is-dragging/);
    await expect
      .poll(
        async () =>
          (await snapshot(page)).nodes.find((item) => item.id === node.id)!.x,
      )
      .not.toBe(node.x);
    if (kind === "thought") {
      await page
        .getByRole("button", { name: `Select ${node.title}`, exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByLabel("Thought text", { exact: true }),
      ).toHaveValue(node.title);
      await page.keyboard.press("Escape");
    }
    const handle = await page
      .getByTestId(`edge-handle-${node.id}`)
      .boundingBox();
    const target = await page.getByTestId("node-fill-discover").boundingBox();
    await page.mouse.move(
      handle!.x + handle!.width / 2,
      handle!.y + handle!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      target!.x + target!.width / 2,
      target!.y + target!.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
    await expect
      .poll(
        async () =>
          (await snapshot(page)).nodes.find((item) => item.id === node.id)!
            .parentId,
      )
      .toBe("discover");
    state = await snapshot(page);
    expect(state.nodes.find((item) => item.id === node.id)!.vertex?.kind).toBe(
      kind,
    );
    expect(state.sessions.some((session) => session.nodeId === node.id)).toBe(
      true,
    );
  });
}

test("deadline becomes overdue and can be rescheduled", async ({ page }) => {
  await initialize(page);
  await create(page, "deadline", "Due soon");
  await page.getByRole("button", { name: "Edit deadline" }).click();
  await page.getByLabel("Deadline", { exact: true }).fill("2020-01-01T12:00");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByLabel("Deadline countdown")).toContainText(
    "Overdue by",
  );
});

test("reading attachment uses the desktop picker and native viewer", async ({
  page,
}) => {
  await initialize(page, true);
  await create(page, "reading", "My paper");
  await page.getByRole("button", { name: "Edit attachment" }).click();
  await page.getByRole("button", { name: "Choose file", exact: true }).click();
  await expect(
    page.getByLabel("File path or website", { exact: true }),
  ).toHaveValue("/tmp/a reading.pdf");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("button", { name: "Open attachment" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("test.opened-resource")),
    )
    .toBe("/tmp/a reading.pdf");
});

test("the creation column and thought oval fit a narrow viewport", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initialize(page);
  const menu = page.getByRole("group", {
    name: "Create a vertex",
    exact: true,
  });
  const bounds = await menu.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await create(page, "thought", "A short thought worth keeping");
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  expect(
    (
      await page
        .locator(".goal[data-vertex-kind=thought] .node-title tspan")
        .allTextContents()
    ).join(" "),
  ).toBe("A short thought worth keeping");
  const canvas = await page.locator(".graph").boundingBox();
  const oval = await page
    .locator(".goal[data-vertex-kind=thought] [data-testid^=node-fill]")
    .boundingBox();
  expect(oval!.x).toBeGreaterThanOrEqual(canvas!.x);
  expect(oval!.x + oval!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("vertices-mobile.png"),
    fullPage: true,
  });
});

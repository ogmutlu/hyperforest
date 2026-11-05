import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { apply } from "../../src/domainClient";
import type { State } from "../../src/model";
import { localDay, localDateTime } from "../../src/calendar";
import { readWorkspace, workspaceFiles } from "../../src/workspaceFiles";
import { installDesktopMock } from "./desktopHarness";

async function initialize(page: Page, desktop: boolean) {
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
    { type: "create", id: "root", title: "Inspector test" },
    now,
  );
  for (const [id, title, vertex, x, y] of [
    ["thought", "An idea", { kind: "thought" }, 750, 440],
    ["bucket", "Ideas bucket", { kind: "bucket" }, 750, 420],
    [
      "habit",
      "Daily practice",
      { kind: "habit", frequency: 3, interval: "day" },
      250,
      450,
    ],
    [
      "deadline",
      "A deadline",
      { kind: "deadline", deadlineAt: now + 86400000 },
      350,
      620,
    ],
  ] as const) {
    state = apply(
      state,
      { type: "isolate", id, treeId: "root", title, vertex },
      now,
    );
    state = apply(state, { type: "move", id, x, y }, now);
  }
  state = apply(
    state,
    { type: "move", id: "thought", x: 750, y: 440, bucketId: "bucket" },
    now,
  );
  const records: number[] = [];
  for (let day = 0; day < 80; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    date.setHours(12, 0, 0, 0);
    const at = day === 0 ? now - 60000 : date.getTime();
    for (let i = 0; i < (day % 5) + 1; i++) records.push(at);
  }
  state = apply(
    state,
    { type: "setHabitHistory", id: "habit", completions: records },
    now,
  );
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
  await expect(page.locator(".graph")).toBeVisible();
  return { state, records };
}
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
async function emptyClick(page: Page) {
  const graph = (await page.locator(".graph-svg").boundingBox())!;
  await page.mouse.click(graph.x + 70, graph.y + 70);
}
async function context(page: Page, id: string) {
  await page
    .getByTestId(`node-fill-${id}`)
    .click({ button: "right", position: { x: 25, y: 20 } });
  return page.getByRole("menu");
}
for (const desktop of [false, true]) {
  const host = desktop ? "desktop" : "web";
  test(`${host}: inspector closes only when opened temporarily by a vertex menu`, async ({
    page,
  }, testInfo) => {
    await initialize(page, desktop);
    await expect(
      page.getByRole("button", { name: "Close vertex panel", exact: true }),
    ).toHaveCount(0);
    await emptyClick(page);
    await expect(page.locator(".inspector")).toBeVisible();
    let menu = await context(page, "thought");
    await menu.getByRole("menuitem", { name: "Details", exact: true }).click();
    await emptyClick(page);
    await expect(page.locator(".inspector")).toBeVisible();
    await page
      .getByRole("button", { name: "Hide vertex panel", exact: true })
      .click();
    await expect(page.locator(".inspector")).toBeHidden();
    await page.reload();
    await expect(page.locator(".inspector")).toBeHidden();
    await page
      .getByRole("button", { name: "Select An idea", exact: true })
      .click();
    await expect(page.locator(".inspector")).toBeHidden();
    menu = await context(page, "thought");
    await expect(
      menu.getByRole("menuitem", { name: "Color", exact: true }),
    ).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Notes", exact: true }).click();
    await expect(page.locator(".inspector")).toBeVisible();
    await page
      .getByLabel("Vertex notes", { exact: true })
      .fill("A note from the context menu");
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await snapshot(page, desktop)).nodes.find(
            (node) => node.id === "thought",
          )?.notes,
      )
      .toBe("A note from the context menu");
    await emptyClick(page);
    await expect(page.locator(".inspector")).toBeHidden();
    menu = await context(page, "bucket");
    await menu
      .getByRole("menuitem", { name: "Show contents", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Bucket contents", exact: true }),
    ).toContainText("An idea");
    await emptyClick(page);
    await expect(page.locator(".inspector")).toBeHidden();
    await page
      .getByRole("button", { name: "Show vertex panel", exact: true })
      .click();
    menu = await context(page, "bucket");
    await menu
      .getByRole("menuitem", { name: "Show contents", exact: true })
      .click();
    await emptyClick(page);
    await expect(page.locator(".inspector")).toBeVisible();
    const thought = page.getByRole("button", {
      name: "Select An idea",
      exact: true,
    });
    await thought.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Notes", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(thought).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath("inspector-context-menu.png"),
    });
  });
  test(`${host}: horizontal habit actions and daily history editing scale to hundreds of repetitions`, async ({
    page,
  }, testInfo) => {
    const { records } = await initialize(page, desktop);
    await page
      .getByRole("button", { name: "Select Daily practice", exact: true })
      .click();
    const actions = page.getByRole("group", {
      name: "Habit actions",
      exact: true,
    });
    const buttons = [
      page.getByRole("button", { name: "Record repetition", exact: true }),
      page.getByRole("button", { name: "Undo last repetition", exact: true }),
      page.getByLabel("Habit history", { exact: true }),
      page.getByRole("button", { name: "Change habit history", exact: true }),
    ];
    const boxes = await Promise.all(
      buttons.map((button) => button.boundingBox()),
    );
    expect(
      Math.max(...boxes.map((box) => box!.y)) -
        Math.min(...boxes.map((box) => box!.y)),
    ).toBeLessThan(2);
    await expect(buttons[0]!.locator(".hover-label")).toBeHidden();
    await buttons[0]!.hover();
    await expect(buttons[0]!.locator(".hover-label")).toBeVisible();
    await buttons[0]!.click();
    await buttons[1]!.click();
    await buttons[3]!.click();
    const dialog = page.getByRole("dialog", {
      name: "Change habit history",
      exact: true,
    });
    await expect(dialog).toContainText(
      "240 repetitions across 80 recorded days",
    );
    await expect(dialog.locator("tbody tr")).toHaveCount(14);
    await expect(
      dialog.getByText("Page 1 of 6", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Next habit days", exact: true })
      .click();
    await expect(dialog).toContainText("Page 2 of 6");
    const date = new Date();
    date.setDate(date.getDate() - 2);
    const day = localDay(date.getTime());
    await dialog.getByLabel("Habit date", { exact: true }).fill(day);
    await expect(
      dialog.getByLabel("Repetitions on date", { exact: true }),
    ).toHaveValue("3");
    await dialog.getByLabel("Repetitions on date", { exact: true }).fill("7");
    await dialog
      .getByRole("button", { name: "Save history", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    const saved = (await snapshot(page, desktop)).nodes.find(
      (node) => node.id === "habit",
    )!.vertex!;
    expect(saved.kind).toBe("habit");
    if (saved.kind !== "habit") throw new Error("Not a habit");
    expect(saved.completions.filter((at) => localDay(at) === day)).toHaveLength(
      7,
    );
    expect(saved.completions.filter((at) => localDay(at) !== day)).toEqual(
      records.filter((at) => localDay(at) !== day).sort((a, b) => a - b),
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Select Daily practice", exact: true })
      .click();
    await page.getByLabel("Habit history", { exact: true }).click();
    await page
      .getByRole("button", { name: "Change history", exact: true })
      .click();
    await expect(dialog).toContainText(
      "244 repetitions across 80 recorded days",
    );
    await dialog.getByLabel("Habit date", { exact: true }).fill(day);
    await dialog.getByLabel("Repetitions on date", { exact: true }).fill("0");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(actions).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("habit-actions.png") });
  });
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "web"}: vertex menus record repetitions and change deadlines`, async ({
    page,
  }) => {
    const { records } = await initialize(page, desktop);
    await page
      .getByRole("button", { name: "Hide vertex panel", exact: true })
      .click();
    let menu = await context(page, "habit");
    await expect(
      menu.getByRole("menuitem", { name: "Change habit history", exact: true }),
    ).toHaveCount(0);
    await menu
      .getByRole("menuitem", { name: "Record repetition", exact: true })
      .click();
    await expect
      .poll(async () => {
        const vertex = (await snapshot(page, desktop)).nodes.find(
          (node) => node.id === "habit",
        )?.vertex;
        return vertex?.kind === "habit" ? vertex.completions.length : 0;
      })
      .toBe(records.length + 1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".inspector")).toBeHidden();
    menu = await context(page, "deadline");
    await menu
      .getByRole("menuitem", { name: "Change deadline", exact: true })
      .click();
    const value = localDateTime(Date.now() + 7 * 86400000);
    await page.getByLabel("Deadline", { exact: true }).fill(value);
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => {
        const vertex = (await snapshot(page, desktop)).nodes.find(
          (node) => node.id === "deadline",
        )?.vertex;
        return vertex?.kind === "deadline" ? vertex.deadlineAt : 0;
      })
      .toBe(new Date(value).getTime());
    await page.reload();
    await expect(page.locator(".graph")).toBeVisible();
    const vertex = (await snapshot(page, desktop)).nodes.find(
      (node) => node.id === "deadline",
    )?.vertex;
    expect(vertex).toMatchObject({
      kind: "deadline",
      deadlineAt: new Date(value).getTime(),
    });
    await expect(page.locator(".inspector")).toBeHidden();
    await page
      .getByRole("button", { name: "Show vertex panel", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Select A deadline", exact: true })
      .click();
    await expect(page.locator(".inspector")).toHaveAttribute(
      "data-editing",
      "false",
    );
    await page
      .locator(".inspector")
      .getByRole("button", { name: "Change deadline", exact: true })
      .click();
    await expect(page.getByLabel("Deadline", { exact: true })).toHaveValue(
      value,
    );
    const nextValue = localDateTime(Date.now() + 8 * 86400000);
    await page.getByLabel("Deadline", { exact: true }).fill(nextValue);
    await page
      .getByRole("button", { name: "Save settings", exact: true })
      .click();
    await expect
      .poll(async () => {
        const next = (await snapshot(page, desktop)).nodes.find(
          (node) => node.id === "deadline",
        )?.vertex;
        return next?.kind === "deadline" ? next.deadlineAt : 0;
      })
      .toBe(new Date(nextValue).getTime());
  });
}

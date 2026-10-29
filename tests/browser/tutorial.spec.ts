import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { installDesktopMock } from "./desktopHarness";
import { sampleWorkspace } from "../sampleWorkspace";
import type { VertexKind } from "../../src/model";
import { apply } from "../../src/domainClient";

const tour = (page: Page) =>
  page.getByRole("dialog", { name: "Hyperforest tutorial", exact: true });
const coach = (page: Page) =>
  page.getByRole("complementary", { name: "Tutorial coach", exact: true });
async function step(page: Page, number: number): Promise<void> {
  await expect(coach(page)).toContainText(`Step ${number} of 15`);
}
async function create(
  page: Page,
  kind: VertexKind,
  name: string,
): Promise<void> {
  await page
    .getByRole("button", { name: `Create ${kind} vertex`, exact: true })
    .click();
  const input = page.getByLabel(
    kind === "thought" ? "Thought text" : "Goal name",
    { exact: true },
  );
  await expect(input).toBeFocused();
  await page.keyboard.type(name);
  if (kind === "reading")
    await page
      .getByLabel("File path or website", { exact: true })
      .fill("https://example.org/paper.pdf");
  await page
    .getByRole("button", { name: "Create vertex", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page
    .getByRole("button", { name: `Select ${name}`, exact: true })
    .click();
  if (kind === "thought") await page.keyboard.press("Escape");
}
async function completePractice(page: Page): Promise<void> {
  await tour(page)
    .getByRole("button", { name: "Start practicing", exact: true })
    .click();
  await step(page, 1);
  await expect(
    tour(page).getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await expect(
    tour(page).getByRole("button", {
      name: "Create vanilla vertex",
      exact: true,
    }),
  ).toHaveClass(/tutorial-target/);
  // Merely opening/cancelling the form does not complete the task.
  await page
    .getByRole("button", { name: "Create vanilla vertex", exact: true })
    .click();
  await step(page, 1);
  await page.keyboard.press("Escape");
  await step(page, 1);
  await create(page, "vanilla", "My practice idea");
  await step(page, 2);
  await expect(tour(page).locator(".inspector")).toHaveAttribute(
    "data-editing",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Done editing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const selected = tour(page).locator(".goal.selected");
  const id = (await selected.getAttribute("data-testid"))!.slice(
    "node-".length,
  );
  const body = page.getByTestId(`node-fill-${id}`);
  await body.scrollIntoViewIfNeeded();
  const position = await body.boundingBox();
  await page.mouse.move(
    position!.x + position!.width / 2,
    position!.y + position!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    position!.x + position!.width / 2 + 45,
    position!.y + position!.height / 2 + 25,
    { steps: 6 },
  );
  await page.mouse.up();
  await step(page, 3);
  const handle = page.getByTestId(`edge-handle-${id}`);
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await page.getByTestId("node-fill-tutorial-root").boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  await step(page, 4);
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(coach(page)).toBeVisible();
  await page
    .getByLabel("Markdown notes", { exact: true })
    .fill("# A practice note\nSomething worth remembering.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await step(page, 5);
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await step(page, 6);
  await expect(coach(page)).toBeVisible();
  await expect(page.getByTestId("focus-timer")).not.toHaveText("00:00:00");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await step(page, 7);
  await page
    .getByRole("button", { name: "Save & finish", exact: true })
    .click();
  await step(page, 8);
  await create(page, "habit", "Read every day");
  await step(page, 9);
  await page
    .getByRole("button", { name: "Record repetition", exact: true })
    .click();
  await step(page, 10);
  await expect(page.getByLabel("Habit progress")).toHaveText("1 / 1 this day");
  await create(page, "deadline", "Submit the draft");
  await step(page, 11);
  await expect(page.getByLabel("Deadline countdown")).toContainText("left");
  await create(page, "thought", "An idea worth keeping");
  await step(page, 12);
  await expect(
    tour(page).locator('.goal[data-vertex-kind="thought"]'),
  ).toHaveCount(1);
  await create(page, "reading", "A helpful paper");
  await step(page, 13);
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await step(page, 14);
  await expect(page.locator(".history-list")).toContainText("My practice idea");
  await page.getByLabel("Subject", { exact: true }).fill("practice idea");
  await step(page, 15);
  await expect(page.getByLabel("History statistics")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(coach(page)).toContainText("PRACTICE COMPLETE");
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("");
  await coach(page)
    .getByRole("button", { name: "Return to my forest", exact: true })
    .click();
  await expect(tour(page)).toHaveCount(0);
}

for (const host of ["web", "desktop"] as const) {
  test(`${host}: complete the tutorial by acting in an isolated practice workspace`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const original = JSON.stringify(sampleWorkspace(Date.now()));
    await page.addInitScript(() =>
      localStorage.setItem(
        "hyperforest.history-range",
        JSON.stringify({ from: "2020-01-01", to: "" }),
      ),
    );
    if (host === "desktop") await installDesktopMock(page);
    else
      await page.addInitScript(
        (original) =>
          localStorage.setItem("hyperforest.workspace.v1", original),
        original,
      );
    await page.goto("./");
    await expect(tour(page)).toBeVisible();
    await expect(tour(page)).toContainText("temporary practice forest");
    await expect(
      tour(page).getByRole("button", { name: "Start practicing" }),
    ).toBeFocused();
    await completePractice(page);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.history-range"),
      ),
    ).toBe(JSON.stringify({ from: "2020-01-01", to: "" }));
    if (host === "web")
      expect(
        await page.evaluate(() =>
          localStorage.getItem("hyperforest.workspace.v1"),
        ),
      ).toBe(original);
    else {
      expect(
        await page.evaluate(() => localStorage.getItem("test.desktop.files")),
      ).toBeNull();
      await page
        .getByRole("button", { name: "Choose directory", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Create your first hypertree" }),
      ).toBeVisible();
      await expect(page.locator(".goal")).toHaveCount(0);
    }
    await page.reload();
    await expect(tour(page)).toHaveCount(0);
    const replay = page
      .locator("footer")
      .getByRole("button", { name: "Tutorial", exact: true });
    await replay.click();
    await tour(page)
      .getByRole("button", { name: "Start practicing", exact: true })
      .click();
    await step(page, 1);
    await expect(tour(page).locator(".goal")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await expect(replay).toBeFocused();
    expect(errors).toEqual([]);
  });
}

for (const dismiss of ["Skip tutorial", "Close tutorial"] as const) {
  test(`${dismiss} persists and leaves existing data untouched`, async ({
    page,
  }) => {
    const original = JSON.stringify(sampleWorkspace(Date.now()));
    await page.addInitScript(
      (original) => localStorage.setItem("hyperforest.workspace.v1", original),
      original,
    );
    await page.goto("./");
    await tour(page)
      .getByRole("button", { name: dismiss, exact: true })
      .click();
    await expect(tour(page)).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.workspace.v1"),
      ),
    ).toBe(original);
    await page.reload();
    await expect(tour(page)).toHaveCount(0);
  });
}

test("restart and exit remain available while a practice form is open", async ({
  page,
}) => {
  await page.goto("./");
  await tour(page).getByRole("button", { name: "Start practicing" }).click();
  await create(page, "vanilla", "Temporary idea");
  await step(page, 2);
  await page.getByRole("button", { name: "Create vanilla vertex" }).click();
  await coach(page)
    .getByRole("button", { name: "Start over", exact: true })
    .click();
  await step(page, 1);
  await expect(tour(page).locator(".goal")).toHaveCount(1);
  await page.getByRole("button", { name: "Create vanilla vertex" }).click();
  await coach(page)
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await expect(tour(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create your first hypertree" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("first-launch tutorial suspends and restores an existing focus view", async ({
  page,
}) => {
  const original = JSON.stringify(
    apply(
      sampleWorkspace(Date.now()),
      { type: "start", id: "read" },
      Date.now(),
    ),
  );
  await page.addInitScript(
    (original) => localStorage.setItem("hyperforest.workspace.v1", original),
    original,
  );
  await page.goto("./");
  await expect(tour(page)).toBeVisible();
  await tour(page)
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Focus session", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("hyperforest.workspace.v1")),
  ).toBe(original);
});

test("the complete interactive tutorial works on a narrow screen", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await completePractice(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an unfinished practice restarts cleanly after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("./");
  await tour(page).getByRole("button", { name: "Start practicing" }).click();
  await create(page, "vanilla", "Not saved");
  await page.reload();
  await expect(
    tour(page).getByRole("button", { name: "Start practicing" }),
  ).toBeInViewport();
  await tour(page).getByRole("button", { name: "Start practicing" }).click();
  await step(page, 1);
  await expect(tour(page).locator(".goal")).toHaveCount(1);
  await page.screenshot({ path: "test-results/tutorial-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: "test-results/tutorial-desktop.png" });
});

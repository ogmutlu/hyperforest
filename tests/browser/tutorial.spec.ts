import "../setup";
import { expect, test } from "@playwright/test";
import { installDesktopMock } from "./desktopHarness";
import { sampleWorkspace } from "../sampleWorkspace";

for (const host of ["web", "desktop"] as const) {
  test(`${host}: first launch, navigation, completion, and footer replay`, async ({
    page,
  }) => {
    if (host === "desktop") await installDesktopMock(page);
    await page.goto("./");
    const tutorial = page.getByRole("dialog", { name: "Hyperforest tutorial" });
    await expect(tutorial).toBeVisible();
    await expect(tutorial).toContainText("Step 1 of 6");
    await expect(tutorial).toContainText(
      host === "desktop"
        ? "Start by choosing a directory"
        : "No account is needed",
    );
    await tutorial.getByRole("button", { name: "Next", exact: true }).click();
    await expect(tutorial.getByRole("heading")).toHaveText(
      "Plant your first hypertree",
    );
    await expect(tutorial.getByRole("heading")).toBeFocused();
    await tutorial.getByRole("button", { name: "Back", exact: true }).click();
    await expect(tutorial).toContainText("Step 1 of 6");
    for (let step = 2; step <= 6; step++) {
      await tutorial.getByRole("button", { name: "Next", exact: true }).click();
      await expect(tutorial).toContainText(`Step ${step} of 6`);
    }
    await expect(tutorial).toContainText(
      host === "desktop" ? "daily backups" : "before clearing browser data",
    );
    await tutorial
      .getByRole("button", { name: "Get started", exact: true })
      .click();
    await expect(tutorial).toHaveCount(0);
    if (host === "desktop") {
      await page
        .getByRole("button", { name: "Choose directory", exact: true })
        .click();
      await expect(page.locator(".desktop-status-bar")).toBeVisible();
      await expect(tutorial).toHaveCount(0);
    }
    await page.reload();
    const footerButton = page
      .locator("footer")
      .getByRole("button", { name: "Tutorial", exact: true });
    await expect(footerButton).toBeVisible();
    await expect(tutorial).toHaveCount(0);
    await footerButton.click();
    await expect(tutorial).toContainText("Step 1 of 6");
    await page.keyboard.press("Escape");
    await expect(tutorial).toHaveCount(0);
    await expect(footerButton).toBeFocused();
  });
}

for (const dismiss of ["Skip tutorial", "Close tutorial"] as const) {
  test(`${dismiss} persists without changing an existing workspace`, async ({
    page,
  }) => {
    const workspace = JSON.stringify(sampleWorkspace(Date.now()));
    await page.addInitScript((workspace) => {
      localStorage.setItem("hyperforest.workspace.v1", workspace);
    }, workspace);
    await page.goto("./");
    const tutorial = page.getByRole("dialog", { name: "Hyperforest tutorial" });
    await tutorial.getByRole("button", { name: dismiss, exact: true }).click();
    await expect(tutorial).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("hyperforest.workspace.v1"),
      ),
    ).toBe(workspace);
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Select A meaningful project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(tutorial).toHaveCount(0);
  });
}

test("tutorial fits a narrow screen and restarts an unfinished first tour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("./");
  const tutorial = page.getByRole("dialog", { name: "Hyperforest tutorial" });
  await tutorial.getByRole("button", { name: "Next", exact: true }).click();
  await page.reload();
  await expect(tutorial).toContainText("Step 1 of 6");
  await expect(
    tutorial.getByRole("button", { name: "Next", exact: true }),
  ).toBeInViewport();
  expect(
    await tutorial.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/tutorial-mobile.png" });
  for (let step = 2; step <= 6; step++) {
    await tutorial.getByRole("button", { name: "Next", exact: true }).click();
    await expect(tutorial).toContainText(`Step ${step} of 6`);
    await expect(
      tutorial.getByRole("button", {
        name: step === 6 ? "Get started" : "Next",
        exact: true,
      }),
    ).toBeInViewport();
  }
  await tutorial.getByRole("button", { name: "Step 1:", exact: false }).click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: "test-results/tutorial-desktop.png" });
});

import "../setup";
import { expect, test } from "@playwright/test";

test("valued habits and full-screen achievements trophy hall with Steam toasts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("hyperforest.tutorial.web.v1", "seen");
    localStorage.setItem("hyperforest.tutorial.desktop.v1", "seen");
  });
  await page.goto("./");

  // Create first hypertree -> triggers First Seed Steam toast!
  await page
    .getByRole("button", { name: /Create your first hypertree/i })
    .click();
  await page.getByLabel("Hypertree name", { exact: true }).fill("Thesis");
  await page.getByRole("button", { name: "Create hypertree" }).click();

  await expect(page.getByTestId("achievement-toast")).toBeVisible();
  await expect(page.getByTestId("achievement-toast")).toContainText(
    "First Seed",
  );

  // Create a valued habit (pages read >= 30/day)
  await page
    .getByRole("button", { name: "Create habit vertex", exact: true })
    .click();
  await page.getByLabel("Goal name", { exact: true }).fill("Read papers");
  await page
    .getByLabel("Tracking mode", { exact: true })
    .selectOption("number");
  await page.getByLabel("Target value", { exact: true }).fill("30");
  await page.getByLabel("Habit unit", { exact: true }).fill("pages");
  await page.getByRole("button", { name: "Create vertex" }).click();

  // Select the valued habit and log 35 pages -> meets target!
  await page
    .getByRole("button", { name: "Select Read papers", exact: true })
    .click();
  await page.getByLabel("Habit value", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Record value", exact: true }).click();
  await expect(page.getByLabel("Habit progress")).toContainText(
    "35 / 30 pages",
  );

  // Topbar shows compact core & daily status bars next to trophy icon
  await expect(page.getByTestId("achievements-status-bars")).toBeVisible();

  // Open full-screen Achievements Trophy Hall
  await page.getByRole("button", { name: "Achievements", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Achievements",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Today’s Wins");
  await expect(dialog).toContainText("7h Today");
  await expect(dialog).toContainText("Almost There");
  await expect(dialog).toContainText("First Seed");
  await expect(dialog).toContainText("Measured Progress");
  // Locked hidden achievements stay completely invisible (only a Steam-style remaining count appears).
  await expect(dialog).not.toContainText("Hidden achievement");
  await expect(dialog).not.toContainText("Strict Formalist");
  await expect(dialog.getByTestId("achievements-hidden-footer")).toContainText(
    "secret achievements remaining",
  );

  // Close back to forest
  await page
    .getByRole("button", { name: "Close achievements", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);

  // Open Session history and verify the monthly focus calendar renders
  await page
    .getByRole("button", { name: "Session history", exact: true })
    .click();
  await expect(page.getByTestId("history-calendar")).toBeVisible();
});

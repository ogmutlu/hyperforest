import "../setup";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { apply } from "../../src/domainClient";
import { diskPayload, diskState } from "../../src/desktop";
import type { State } from "../../src/model";
import { installDesktopMock } from "./desktopHarness";

async function action(page: Page, name: string): Promise<void> {
  await page.getByLabel("Workspace actions", { exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

function fixture(): State {
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
    { type: "create", id: "root", title: "Desktop research" },
    now - 100000,
  );
  state = apply(
    state,
    { type: "add", id: "reading", parentId: "root", title: "Reading" },
    now - 99000,
  );
  state = apply(
    state,
    {
      type: "edit",
      id: "reading",
      title: "Reading",
      notes: "# Desktop notes\nPreserve Ω and Markdown.",
      estimateMinutes: 25,
    },
    now - 98000,
  );
  state = apply(state, { type: "start", id: "reading" }, now - 90000);
  state = apply(state, { type: "pause" }, now - 60000);
  state = apply(state, { type: "start", id: "reading" }, now - 50000);
  return apply(state, { type: "finish", id: "saved" }, now - 10000);
}

test("desktop ZIP imports on web and the edited web ZIP imports back on desktop", async ({
  page,
}) => {
  test.setTimeout(60000);
  const files = {
    directory: "/tmp/hyperforest-desktop-test",
    ...diskPayload(fixture(), Date.now()),
  };
  await installDesktopMock(page, files);
  const desktopDownloads: string[] = [];
  page.on("download", (download) =>
    desktopDownloads.push(download.suggestedFilename()),
  );
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Select Desktop research", exact: true }),
  ).toBeVisible();
  await action(page, "Export");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("test.exported-zip")))
    .not.toBeNull();
  const bytes: number[] = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test.exported-zip")!),
  );
  expect(bytes.slice(0, 2)).toEqual([80, 75]);
  expect(desktopDownloads).toEqual([]);

  const web = await page.context().newPage();
  await web.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await web.goto("./");
  await expect(
    web.getByRole("heading", { name: "Every hypertree starts with one idea." }),
  ).toBeVisible();
  const chooser = web.waitForEvent("filechooser");
  await action(web, "Import");
  await (
    await chooser
  ).setFiles({
    name: "desktop.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(bytes),
  });
  const preview = web.getByRole("dialog", {
    name: "Import backup",
    exact: true,
  });
  await expect(preview).toContainText("1 saved sessions");
  await preview
    .getByRole("button", { name: "Replace workspace", exact: true })
    .click();
  await expect(
    web.getByRole("button", { name: "Select Desktop research", exact: true }),
  ).toBeVisible();
  await web
    .getByRole("button", { name: "Select Reading", exact: true })
    .click();
  await web.getByRole("button", { name: "Edit goal", exact: true }).click();
  await expect(web.getByLabel("Markdown notes", { exact: true })).toHaveValue(
    "# Desktop notes\nPreserve Ω and Markdown.",
  );
  await web
    .getByLabel("Markdown notes", { exact: true })
    .fill("# Edited on web\nλ → Lean\n");
  await web.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    web.getByRole("dialog", { name: "Edit goal and notes", exact: true }),
  ).toHaveCount(0);
  const webState: State = await web.evaluate(() =>
    JSON.parse(localStorage.getItem("hyperforest.workspace.v1")!),
  );
  expect(webState.sessions).toEqual(diskState(files).sessions);
  const download = web.waitForEvent("download");
  await action(web, "Export");
  const webArchive = await readFile((await (await download).path())!);
  await page.evaluate(
    (contents) =>
      localStorage.setItem("test.import-zip", JSON.stringify(contents)),
    Array.from(webArchive),
  );

  const before = await page.evaluate(() =>
    localStorage.getItem("test.desktop.files"),
  );
  await action(page, "Import");
  const desktopPreview = page.getByRole("dialog", {
    name: "Import backup",
    exact: true,
  });
  await desktopPreview
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("test.desktop.files")),
  ).toBe(before);
  await action(page, "Import");
  await desktopPreview
    .getByRole("button", { name: "Replace workspace", exact: true })
    .click();
  await expect(desktopPreview).toHaveCount(0);
  const returned = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test.desktop.files")!),
  );
  expect(diskState(returned)).toEqual(webState);

  await page.evaluate(() => localStorage.setItem("test.fail-export", "yes"));
  await action(page, "Export");
  await expect(page.getByRole("alert")).toContainText(
    "No space left on device",
  );
  await page.evaluate(() => localStorage.removeItem("test.fail-export"));
  await action(page, "Export");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    localStorage.getItem("test.desktop.files"),
  );
  await page.evaluate(() => localStorage.setItem("test.import-zip", "[0,1,2]"));
  await action(page, "Import");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(desktopPreview).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("test.desktop.files")),
  ).toBe(saved);
  await web.close();
});

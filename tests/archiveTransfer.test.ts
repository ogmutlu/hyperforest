import { beforeEach, expect, it, vi } from "vitest";
const { ipc } = vi.hoisted(() => ({ ipc: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc, isTauri: () => true }));
import { openDesktopArchive, saveArchive } from "../src/archiveTransfer";

beforeEach(() => ipc.mockReset());

it("desktop export sends unchanged binary ZIP bytes to the native save command", async () => {
  ipc.mockResolvedValue(true);
  await saveArchive(new Uint8Array([80, 75, 0, 127, 128, 255]));
  expect(ipc).toHaveBeenCalledWith("desktop_export_archive", {
    contents: [80, 75, 0, 127, 128, 255],
  });
});

it("desktop import receives binary bytes and treats cancellation as no selection", async () => {
  ipc.mockResolvedValueOnce([80, 75, 0, 128, 255]).mockResolvedValueOnce(null);
  expect(await openDesktopArchive()).toEqual(
    new Uint8Array([80, 75, 0, 128, 255]),
  );
  expect(await openDesktopArchive()).toBeNull();
  expect(ipc).toHaveBeenCalledWith("desktop_import_archive");
});

it("cancelled export is harmless and native file errors propagate to the interface", async () => {
  ipc.mockResolvedValueOnce(false).mockRejectedValueOnce("Disk full");
  await expect(saveArchive(new Uint8Array([80, 75]))).resolves.toBeUndefined();
  await expect(saveArchive(new Uint8Array([80, 75]))).rejects.toBe("Disk full");
});

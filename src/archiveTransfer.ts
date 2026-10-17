/** Host file transport only. Both hosts use export.ts for the same ZIP format. */
import { invoke, isTauri } from "@tauri-apps/api/core";

interface SaveWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
}

export async function saveArchive(contents: Uint8Array): Promise<void> {
  if (isTauri()) {
    await invoke("desktop_export_archive", { contents: Array.from(contents) });
    return;
  }
  const name = "hyperforest-export.zip";
  const blob = new Blob([new Uint8Array(contents)], {
    type: "application/zip",
  });
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (!picker) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = await picker.call(window, {
    suggestedName: name,
    types: [
      {
        description: "Hyperforest backup",
        accept: { "application/zip": [".zip"] },
      },
    ],
  });
  const stream = await file.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
  } catch (error: unknown) {
    await stream.abort().catch(() => {});
    throw error;
  }
}

export async function openDesktopArchive(): Promise<Uint8Array | null> {
  const bytes = await invoke<number[] | null>("desktop_import_archive");
  return bytes === null ? null : new Uint8Array(bytes);
}

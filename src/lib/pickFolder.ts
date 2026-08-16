export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Scegli una cartella",
  });
  if (typeof selected === "string" && selected.length > 0) {
    return selected;
  }
  return null;
}

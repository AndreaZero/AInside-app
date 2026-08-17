export async function pickFolder(
  title = "Scegli una cartella",
): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof selected === "string" && selected.length > 0) {
    return selected;
  }
  return null;
}

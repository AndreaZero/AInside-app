export type LibraryStatus = "pronto" | "incompleto" | "corrotto";

export type ActiveModel = {
  modelId: string;
  variantId: string;
  path: string;
};

export type LibraryItem = {
  modelId: string;
  modelName: string;
  variantId: string;
  filename: string;
  path: string;
  inDownloadRoot: boolean;
  bytes: number;
  expectedBytes: number;
  status: LibraryStatus;
  statusLabel: string;
  active: boolean;
};

export type LibrarySnapshot = {
  items: LibraryItem[];
  totalBytes: number;
  readyCount: number;
  active: ActiveModel | null;
};

export function itemFor(
  items: LibraryItem[],
  variantId: string,
): LibraryItem | undefined {
  return items.find((item) => item.variantId === variantId);
}

export function removeCopy(name: string): { title: string; description: string } {
  return {
    title: `Eliminare «${name}»?`,
    description: "Cancello il file dal disco, non solo la voce in lista.",
  };
}

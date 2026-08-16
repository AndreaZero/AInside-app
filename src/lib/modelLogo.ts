import type { CatalogModel } from "./catalog";

export type LogoSource = {
  id?: string;
  name?: string;
  author?: string;
  logoOrg?: string | null;
  stats?: { repo?: string } | null;
};

const AUTHOR_ORG: Record<string, string> = {
  qwen: "Qwen",
  google: "google",
  meta: "meta-llama",
  nvidia: "nvidia",
  cohere: "CohereLabs",
  deepreinforce: "DeepReinforce",
  liquid: "LiquidAI",
  unsloth: "unsloth",
};

const ORG_ALIASES: Record<string, string[]> = {
  CohereLabs: ["CohereLabs", "Cohere", "CohereForAI"],
  google: ["google", "google-deepmind"],
  DeepReinforce: ["DeepReinforce"],
  "meta-llama": ["meta-llama", "facebook"],
};

const avatars = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function logoOrgFor(source: LogoSource): string {
  if (source.logoOrg?.trim()) return source.logoOrg.trim();
  const hay = `${source.id ?? ""} ${source.name ?? ""} ${source.author ?? ""}`;
  for (const [key, org] of Object.entries(AUTHOR_ORG)) {
    if (new RegExp(key, "i").test(hay)) return org;
  }
  const owner = source.stats?.repo?.split("/")[0];
  return owner || "unsloth";
}

export function logoOrgCandidates(source: LogoSource): string[] {
  const primary = logoOrgFor(source);
  const list = [...(ORG_ALIASES[primary] ?? [primary])];
  const owner = source.stats?.repo?.split("/")[0];
  if (owner && !list.includes(owner)) list.push(owner);
  return list;
}

async function requestAvatar(org: string): Promise<string | null> {
  const urls = [
    `https://huggingface.co/api/organizations/${encodeURIComponent(org)}/avatar`,
    `https://huggingface.co/api/organizations/${encodeURIComponent(org)}`,
    `https://huggingface.co/api/users/${encodeURIComponent(org)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as { avatarUrl?: string; avatar_url?: string };
      const avatar = data.avatarUrl ?? data.avatar_url;
      if (typeof avatar === "string" && avatar.startsWith("https://")) {
        return avatar;
      }
    } catch {
      /* rete assente o CORS */
    }
  }
  return null;
}

export function fetchHfAvatar(org: string): Promise<string | null> {
  if (avatars.has(org)) return Promise.resolve(avatars.get(org) ?? null);
  const existing = inflight.get(org);
  if (existing) return existing;
  const task = requestAvatar(org).then((url) => {
    avatars.set(org, url);
    inflight.delete(org);
    emit();
    return url;
  });
  inflight.set(org, task);
  return task;
}

export function prefetchModelLogos(models: CatalogModel[]) {
  const orgs = new Set<string>();
  for (const model of models) {
    for (const org of logoOrgCandidates(model)) orgs.add(org);
  }
  void Promise.all([...orgs].map((org) => fetchHfAvatar(org)));
}

export function resolvedLogoUrl(source: LogoSource): string | null {
  for (const org of logoOrgCandidates(source)) {
    const url = avatars.get(org);
    if (url) return url;
  }
  return null;
}

export function subscribeLogos(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function fallbackAvatarSrc(source: LogoSource): string {
  const org = logoOrgFor(source);
  return `https://huggingface.co/avatars/${encodeURIComponent(org)}`;
}

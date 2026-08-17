import { invoke } from "@tauri-apps/api/core";

export type WorkspaceNode = {
  name: string;
  rel: string;
  dir: boolean;
  children: WorkspaceNode[];
};

export type WorkspaceTree = {
  nodes: WorkspaceNode[];
  truncated: boolean;
  count: number;
};

export type WorkspaceFile = {
  rel: string;
  text: string;
  truncated: boolean;
  kind?: string;
  mime?: string | null;
  dataUrl?: string | null;
};

export type WorkspaceHit = {
  rel: string;
  kind: "path" | "content" | string;
  line?: number | null;
  snippet?: string | null;
};

export async function workspaceTree(root: string): Promise<WorkspaceTree> {
  return invoke<WorkspaceTree>("workspace_tree", { root });
}

export async function workspaceRead(root: string, rel: string): Promise<WorkspaceFile> {
  return invoke<WorkspaceFile>("workspace_read", { root, rel });
}

export async function workspaceSearch(root: string, query: string): Promise<WorkspaceHit[]> {
  return invoke<WorkspaceHit[]>("workspace_search", { root, query });
}

export type CodePatch = {
  rel: string;
  status: "pending" | "applied" | "error" | "skipped" | string;
  added?: number;
  removed?: number;
  secret?: boolean;
  created?: boolean;
  error?: string | null;
};

export type ApplyResult = {
  files: CodePatch[];
  wrote: string[];
};

export async function workspacePreview(root: string, text: string): Promise<CodePatch[]> {
  return invoke<CodePatch[]>("workspace_preview", { root, text });
}

export async function workspaceApply(input: {
  root: string;
  text: string;
  rels?: string[];
  grant?: "once" | "session" | "folder" | "always" | null;
  allowSecrets?: boolean;
}): Promise<ApplyResult> {
  return invoke<ApplyResult>("workspace_apply", {
    root: input.root,
    text: input.text,
    rels: input.rels ?? [],
    grant: input.grant ?? null,
    allowSecrets: input.allowSecrets ?? false,
  });
}

export async function workspaceUndo(root: string): Promise<string[]> {
  return invoke<string[]>("workspace_undo", { root });
}

export function stripEditBlocks(text: string): string {
  const idx = text.search(/\*\*\*\s*File:/i);
  if (idx >= 0) {
    return text.slice(0, idx).trim();
  }
  return text.trim();
}

export function flattenFiles(nodes: WorkspaceNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.dir) {
      flattenFiles(node.children, into);
    } else {
      into.push(node.rel);
    }
  }
  return into;
}

export function filterNodes(nodes: WorkspaceNode[], query: string): WorkspaceNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return nodes;
  }
  const out: WorkspaceNode[] = [];
  for (const node of nodes) {
    if (node.dir) {
      const children = filterNodes(node.children, query);
      if (
        children.length > 0 ||
        node.name.toLowerCase().includes(needle) ||
        node.rel.toLowerCase().includes(needle)
      ) {
        out.push({ ...node, children });
      }
    } else if (
      node.name.toLowerCase().includes(needle) ||
      node.rel.toLowerCase().includes(needle)
    ) {
      out.push(node);
    }
  }
  return out;
}

export function mentionAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) {
    return null;
  }
  const between = before.slice(at + 1);
  if (between.includes(" ") || between.includes("\n") || between.includes("\t")) {
    return null;
  }
  return { start: at, query: between };
}

export function fileLabel(rel: string): string {
  const parts = rel.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? rel;
}

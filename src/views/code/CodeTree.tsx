import { useEffect, useMemo, useState } from "react";
import { cx } from "../../lib/cx";
import {
  filterNodes,
  workspaceSearch,
  type WorkspaceHit,
  type WorkspaceNode,
} from "../../lib/workspace";
import { IconChevron, IconFolder } from "../../ui/icons";

export function CodeTree({
  root,
  rootName,
  nodes,
  truncated,
  loading,
  error,
  selected,
  onSelect,
}: {
  root: string;
  rootName: string;
  nodes: WorkspaceNode[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
  selected: string | null;
  onSelect: (rel: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<WorkspaceHit[]>([]);
  const visible = useMemo(() => filterNodes(nodes, query), [nodes, query]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setExtra([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const seen = new Set(flattenRels(filterNodes(nodes, query)));
      void workspaceSearch(root, needle)
        .then((hits) => {
          if (!cancelled) {
            setExtra(hits.filter((hit) => !seen.has(hit.rel)));
          }
        })
        .catch(() => {
          if (!cancelled) setExtra([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, root, nodes]);

  return (
    <aside className="code-tree" aria-label="File del progetto">
      <p className="code-tree-name">{rootName}</p>
      <label className="code-tree-search">
        <span className="sr-only">Cerca file</span>
        <input
          type="search"
          value={query}
          placeholder="Cerca file"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {loading ? (
        <p className="code-tree-hint">Carico i file…</p>
      ) : error ? (
        <p className="code-tree-hint">{error}</p>
      ) : visible.length === 0 && extra.length === 0 ? (
        <p className="code-tree-hint">
          {query.trim() ? "Nessun file con questo nome." : "Cartella vuota."}
        </p>
      ) : visible.length > 0 ? (
        <ul className="code-tree-list">
          {visible.map((node) => (
            <TreeNode
              key={node.rel}
              node={node}
              depth={0}
              selected={selected}
              forceOpen={Boolean(query.trim())}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
      {extra.length > 0 ? (
        <div className="code-tree-extra">
          <p className="code-tree-hint">Nel resto del progetto</p>
          <ul className="code-tree-list">
            {extra.map((hit) => (
              <li key={`extra-${hit.rel}`}>
                <button
                  type="button"
                  className={cx("code-tree-item", selected === hit.rel && "is-active")}
                  onClick={() => onSelect(hit.rel)}
                >
                  <span className="code-tree-file">{hit.rel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {truncated && !query.trim() ? (
        <p className="code-tree-hint">Mostro i primi file. Cerca per trovarne altri.</p>
      ) : null}
    </aside>
  );
}

function flattenRels(nodes: WorkspaceNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    into.push(node.rel);
    if (node.dir) {
      flattenRels(node.children, into);
    }
  }
  return into;
}

function TreeNode({
  node,
  depth,
  selected,
  forceOpen,
  onSelect,
}: {
  node: WorkspaceNode;
  depth: number;
  selected: string | null;
  forceOpen: boolean;
  onSelect: (rel: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const expanded = forceOpen || open;

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  if (node.dir) {
    return (
      <li>
        <button
          type="button"
          className="code-tree-item is-dir"
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={expanded}
        >
          <IconChevron size={14} className={cx("code-tree-chevron", expanded && "is-open")} />
          <IconFolder size={14} />
          <span>{node.name}</span>
        </button>
        {expanded && node.children.length > 0 ? (
          <ul className="code-tree-list">
            {node.children.map((child) => (
              <TreeNode
                key={child.rel}
                node={child}
                depth={depth + 1}
                selected={selected}
                forceOpen={forceOpen}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className={cx("code-tree-item", selected === node.rel && "is-active")}
        style={{ paddingLeft: 8 + depth * 12 + 22 }}
        onClick={() => onSelect(node.rel)}
      >
        <span className="code-tree-file">{node.name}</span>
      </button>
    </li>
  );
}

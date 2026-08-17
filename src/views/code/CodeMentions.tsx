import type { WorkspaceHit } from "../../lib/workspace";

export function CodeMentions({
  hits,
  active,
  onPick,
}: {
  hits: WorkspaceHit[];
  active: number;
  onPick: (rel: string) => void;
}) {
  if (hits.length === 0) {
    return null;
  }
  return (
    <ul className="code-mentions" role="listbox">
      {hits.map((hit, index) => (
        <li key={`${hit.kind}-${hit.rel}-${hit.line ?? 0}`}>
          <button
            type="button"
            className={index === active ? "is-active" : undefined}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(hit.rel);
            }}
          >
            <span>{hit.rel}</span>
            {hit.kind === "content" && hit.snippet ? (
              <span className="code-mention-snip">{hit.snippet}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

import type { ReactNode } from "react";
import {
  parseMarkdown,
  type MdBlock,
  type MdInline,
} from "../../lib/markdown";
import { CodeBlock } from "./CodeBlock";

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.t) {
          case "text":
            return <span key={index}>{node.v}</span>;
          case "br":
            return <br key={index} />;
          case "code":
            return (
              <code key={index} className="md-code">
                {node.v}
              </code>
            );
          case "strong":
            return (
              <strong key={index}>
                <Inline nodes={node.c} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <Inline nodes={node.c} />
              </em>
            );
          case "strike":
            return (
              <s key={index}>
                <Inline nodes={node.c} />
              </s>
            );
          case "link":
            return (
              <SafeLink key={index} href={node.href}>
                <Inline nodes={node.c} />
              </SafeLink>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = /^https?:\/\//i.test(href);
  if (!safe) {
    return <span>{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function Lines({ lines }: { lines: MdInline[][] }) {
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          <Inline nodes={line} />
        </span>
      ))}
    </>
  );
}

function Block({ block }: { block: MdBlock }) {
  switch (block.t) {
    case "p":
      return (
        <p>
          <Lines lines={block.lines} />
        </p>
      );
    case "h": {
      const Tag = (`h${block.l}` as "h1" | "h2" | "h3");
      return (
        <Tag>
          <Inline nodes={block.c} />
        </Tag>
      );
    }
    case "code":
      return <CodeBlock lang={block.lang} code={block.v} />;
    case "ul":
      return (
        <ul>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item.c} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol start={block.start}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item.c} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote>
          <Lines lines={block.lines} />
        </blockquote>
      );
    case "hr":
      return <hr />;
    case "table":
      return (
        <div className="md-table-wrap">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index}>
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.body.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="md">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
      {caret ? <span className="msg-caret" /> : null}
    </div>
  );
}

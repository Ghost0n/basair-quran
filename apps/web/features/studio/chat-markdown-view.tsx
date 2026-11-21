import type { ReactNode } from "react";

import { parseMarkdown, type Block, type Inline } from "./chat-markdown";

function renderInline(parts: Inline[]): ReactNode[] {
  return parts.map((part, index) => {
    if (part.code) return <code key={index}>{part.text}</code>;
    if (part.bold) return <strong key={index}>{part.text}</strong>;
    if (part.italic) return <em key={index}>{part.text}</em>;
    return <span key={index}>{part.text}</span>;
  });
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.kind) {
    case "h": {
      const Tag = (["h4", "h5", "h6"] as const)[block.level - 1];
      return <Tag key={index}>{renderInline(block.inline)}</Tag>;
    }
    case "ul":
      return (
        <ul key={index}>
          {block.items.map((item, at) => (
            <li key={at}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={index} start={block.start}>
          {block.items.map((item, at) => (
            <li key={at}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote key={index}>{block.blocks.map(renderBlock)}</blockquote>;
    case "hr":
      return <hr key={index} />;
    default:
      return <p key={index}>{renderInline(block.inline)}</p>;
  }
}

/** Markdown shown as text (chat-markdown.ts): never parsed as HTML. */
export function ChatMarkdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? "qb-md"}>{parseMarkdown(source).map(renderBlock)}</div>;
}

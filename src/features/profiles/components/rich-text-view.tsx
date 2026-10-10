import type { ReactNode } from "react";

import type {
  RichTextBlock,
  RichTextDocument,
  RichTextInline,
  RichTextListItem,
} from "@/features/profiles/domain";
import { cn } from "@/lib/utils";

/**
 * Read-only rendering of profile content as React elements (no HTML strings, no
 * `dangerouslySetInnerHTML`): only the node types the content schema allows exist.
 */
function renderInline(inline: RichTextInline, key: number): ReactNode {
  if (inline.type === "hardBreak") return <br key={key} />;
  let node: ReactNode = inline.text;
  for (const mark of inline.marks ?? []) {
    if (mark.type === "bold") node = <strong>{node}</strong>;
    else if (mark.type === "italic") node = <em>{node}</em>;
    else node = <u>{node}</u>;
  }
  return <span key={key}>{node}</span>;
}

function renderBlock(block: RichTextBlock | RichTextListItem, key: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key}>{block.content?.map(renderInline)}</p>;
    case "heading": {
      const Heading = block.attrs.level === 2 ? "h2" : "h3";
      return <Heading key={key}>{block.content?.map(renderInline)}</Heading>;
    }
    case "blockquote":
      return <blockquote key={key}>{block.content.map(renderBlock)}</blockquote>;
    case "bulletList":
      return <ul key={key}>{block.content.map(renderBlock)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={block.attrs?.start ?? undefined}>
          {block.content.map(renderBlock)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{block.content.map(renderBlock)}</li>;
  }
}

export function RichTextView({
  content,
  className,
}: {
  content: RichTextDocument;
  className?: string;
}) {
  return <div className={cn("rich-text", className)}>{content.content.map(renderBlock)}</div>;
}

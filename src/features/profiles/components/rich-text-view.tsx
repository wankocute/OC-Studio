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

/** `tail` is rendered after the last text of the block (e.g. a typing caret). */
function renderBlock(
  block: RichTextBlock | RichTextListItem,
  key: number,
  tail?: ReactNode,
): ReactNode {
  const children = (items: readonly (RichTextBlock | RichTextListItem)[]) =>
    items.map((child, index) =>
      renderBlock(child, index, index === items.length - 1 ? tail : undefined),
    );
  switch (block.type) {
    case "paragraph":
      return (
        <p key={key}>
          {block.content?.map(renderInline)}
          {tail}
        </p>
      );
    case "heading": {
      const Heading = block.attrs.level === 2 ? "h2" : "h3";
      return (
        <Heading key={key}>
          {block.content?.map(renderInline)}
          {tail}
        </Heading>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{children(block.content)}</blockquote>;
    case "bulletList":
      return <ul key={key}>{children(block.content)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={block.attrs?.start ?? undefined}>
          {children(block.content)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children(block.content)}</li>;
  }
}

export function RichTextView({
  content,
  className,
  tail,
}: {
  content: RichTextDocument;
  className?: string;
  /** Rendered after the last text of the document. */
  tail?: ReactNode;
}) {
  const blocks = content.content;
  return (
    <div className={cn("rich-text", className)}>
      {blocks.map((block, index) =>
        renderBlock(block, index, index === blocks.length - 1 ? tail : undefined),
      )}
    </div>
  );
}

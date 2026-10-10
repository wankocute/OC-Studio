"use client";

import { Placeholder } from "@tiptap/extensions";
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Quote,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { documentText, type RichTextDocument } from "@/features/profiles/domain";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.profiles.toolbar;

/**
 * Only what the profile content schema accepts: no code, links, images, strike or rules, and
 * headings at levels 2–3 (the section title is the level-1 heading). Pasted content outside this
 * schema is reduced to it by ProseMirror.
 */
const extensions = (placeholder: string) => [
  StarterKit.configure({
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    heading: { levels: [2, 3] },
  }),
  Placeholder.configure({ placeholder }),
];

/**
 * The editor JSON as plain objects. ProseMirror builds node attributes with a null prototype,
 * which React cannot pass to a Server Action (it would arrive as an opaque reference).
 */
function plainDocument(editor: Editor): RichTextDocument {
  return JSON.parse(JSON.stringify(editor.getJSON())) as RichTextDocument;
}

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  h2: boolean;
  h3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  canUndo: boolean;
  canRedo: boolean;
  characters: number;
};

function selectToolbarState({ editor }: { editor: Editor | null }): ToolbarState | null {
  if (!editor) return null;
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    characters: documentText(editor.getJSON() as RichTextDocument).length,
  };
}

type ToolButton = {
  key: keyof ToolbarState;
  label: string;
  /** Shown in the tooltip; `aria-keyshortcuts` uses the same keys. */
  shortcut: string;
  ariaShortcut: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  toggle: boolean;
};

const TOOL_GROUPS: ToolButton[][] = [
  [
    {
      key: "bold",
      label: t.bold,
      shortcut: "Ctrl+B",
      ariaShortcut: "Control+B",
      icon: Bold,
      run: (editor) => editor.chain().focus().toggleBold().run(),
      toggle: true,
    },
    {
      key: "italic",
      label: t.italic,
      shortcut: "Ctrl+I",
      ariaShortcut: "Control+I",
      icon: Italic,
      run: (editor) => editor.chain().focus().toggleItalic().run(),
      toggle: true,
    },
    {
      key: "underline",
      label: t.underline,
      shortcut: "Ctrl+U",
      ariaShortcut: "Control+U",
      icon: Underline,
      run: (editor) => editor.chain().focus().toggleUnderline().run(),
      toggle: true,
    },
  ],
  [
    {
      key: "h2",
      label: t.heading2,
      shortcut: "Ctrl+Alt+2",
      ariaShortcut: "Control+Alt+2",
      icon: Heading2,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      toggle: true,
    },
    {
      key: "h3",
      label: t.heading3,
      shortcut: "Ctrl+Alt+3",
      ariaShortcut: "Control+Alt+3",
      icon: Heading3,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      toggle: true,
    },
  ],
  [
    {
      key: "bulletList",
      label: t.bulletList,
      shortcut: "Ctrl+Shift+8",
      ariaShortcut: "Control+Shift+8",
      icon: List,
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
      toggle: true,
    },
    {
      key: "orderedList",
      label: t.orderedList,
      shortcut: "Ctrl+Shift+7",
      ariaShortcut: "Control+Shift+7",
      icon: ListOrdered,
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      toggle: true,
    },
    {
      key: "blockquote",
      label: t.blockquote,
      shortcut: "Ctrl+Shift+B",
      ariaShortcut: "Control+Shift+B",
      icon: Quote,
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      toggle: true,
    },
  ],
  [
    {
      key: "canUndo",
      label: t.undo,
      shortcut: "Ctrl+Z",
      ariaShortcut: "Control+Z",
      icon: Undo2,
      run: (editor) => editor.chain().focus().undo().run(),
      toggle: false,
    },
    {
      key: "canRedo",
      label: t.redo,
      shortcut: "Ctrl+Shift+Z",
      ariaShortcut: "Control+Shift+Z",
      icon: Redo2,
      run: (editor) => editor.chain().focus().redo().run(),
      toggle: false,
    },
  ],
];

function Toolbar({ editor, state }: { editor: Editor | null; state: ToolbarState | null }) {
  return (
    <div
      role="toolbar"
      aria-label={t.label}
      className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
    >
      {TOOL_GROUPS.map((group, index) => (
        <div key={index} className={cn("flex items-center gap-0.5", index > 0 && "border-l pl-1")}>
          {group.map((tool) => {
            const Icon = tool.icon;
            const active = Boolean(state?.[tool.key]);
            return (
              <Tooltip key={tool.key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tool.label}
                    aria-keyshortcuts={tool.ariaShortcut}
                    {...(tool.toggle ? { "aria-pressed": active } : {})}
                    disabled={!editor || (!tool.toggle && !active)}
                    className={cn(tool.toggle && active && "bg-muted text-foreground")}
                    onClick={() => editor && tool.run(editor)}
                  >
                    <Icon aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {tool.label} <span className="opacity-70">({tool.shortcut})</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function RichTextEditor({
  id,
  label,
  placeholder,
  initialContent,
  onChange,
  describedBy,
  invalid,
}: {
  id: string;
  label: string;
  placeholder: string;
  initialContent: RichTextDocument | null;
  onChange: (content: RichTextDocument) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  // Tiptap keeps the first `onUpdate`; read the latest callback through a ref.
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: extensions(placeholder),
    content: initialContent ?? undefined,
    // Rendered on the client only: avoids hydration mismatches with server HTML.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        spellcheck: "true",
        lang: "vi",
        class: "rich-text min-h-72 px-4 py-3 outline-none md:min-h-96",
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(plainDocument(current)),
  });

  const state = useEditorState({ editor, selector: selectToolbarState });

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        invalid && "border-destructive",
      )}
    >
      <Toolbar editor={editor} state={state} />
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="min-h-72 px-4 py-3 md:min-h-96" aria-hidden />
      )}
      <p className="border-t px-4 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
        {messages.profiles.characterCount(state?.characters ?? 0)}
      </p>
    </div>
  );
}

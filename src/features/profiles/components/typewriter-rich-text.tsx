"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RichTextDocument } from "@/features/profiles/domain";
import { messages } from "@/i18n";

import { markTyped, shouldType, sliceDocument, typedLength } from "./rich-text-typing";
import { RichTextView } from "./rich-text-view";

/** Whole reveal stays short: long texts type faster rather than making the user wait. */
const MIN_MS = 500;
const MAX_MS = 2_400;
const MS_PER_CHAR = 14;

/** Pending "left mid-way" marks, cancelled when the same text mounts again right away. */
const leaving = new Map<string, number>();

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * An AI result typed out once (React Bits' Text Type, adapted to rich text). Only results marked
 * with `markForTyping` animate, and only the first time they are shown; anything else, or reduced
 * motion, renders at once. The animation only affects display: the full document is what screen
 * readers get and what "apply" sends, so no character can be lost.
 */
export function TypewriterRichText({
  jobId,
  content,
}: {
  /** Typing key (`markForTyping`): a job id, or a section draft the text was written into. */
  jobId: string;
  content: RichTextDocument;
}) {
  const total = typedLength(content);
  // Decided once per mount, so re-renders never restart it.
  const [typing, setTyping] = useState(() => shouldType(jobId) && !reducedMotion());
  const [count, setCount] = useState(0);

  useEffect(() => {
    // An unmount that is immediately followed by a mount (Strict Mode) is not "leaving".
    window.clearTimeout(leaving.get(jobId));
    // Shown at once (reduced motion, already seen, or skipped): never typed later.
    if (!typing) return markTyped(jobId);
    const duration = Math.min(MAX_MS, Math.max(MIN_MS, total * MS_PER_CHAR));
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(total, Math.round(((now - started) / duration) * total));
      setCount(next);
      if (next < total) frame = requestAnimationFrame(tick);
      else setTyping(false);
    });
    return () => {
      cancelAnimationFrame(frame);
      // Leaving mid-way (dialog closed, tab switched) counts as shown: no replay later.
      leaving.set(
        jobId,
        window.setTimeout(() => markTyped(jobId)),
      );
    };
  }, [typing, total, jobId]);

  if (!typing) return <RichTextView content={content} />;
  return (
    <div className="space-y-2">
      <div className="sr-only">
        <RichTextView content={content} />
      </div>
      <div aria-hidden>
        <RichTextView
          content={sliceDocument(content, count)}
          tail={
            <span className="ml-px inline-block h-[1.1em] w-0.5 translate-y-[0.2em] animate-caret-blink rounded-full bg-primary" />
          }
        />
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setTyping(false)}>
        {messages.profileAi.showAll}
      </Button>
    </div>
  );
}

"use client";

import { GripVertical, Trash2 } from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { messages } from "@/i18n";
import { EASE_OUT, MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

const t = messages.editor.shredder;

/** Movement before a press becomes a drag, so a plain click never shows the bin. */
const DRAG_THRESHOLD = 5;
/** The drop zone reaches a little past the bin so it is easy to hit. */
const DROP_PADDING = 28;
/** Distance (from the bin's centre) at which the bin starts reacting. */
const NEAR_DISTANCE = 220;
const GHOST_WIDTH = 260;
/** Where the pointer holds the preview (next to its grip). */
const GRAB_OFFSET = { x: 18, y: 22 } as const;
const STRIPS = 9;
/** Seconds the preview takes to move into the bin before it is cut. */
const FEED_DURATION = 0.22;

export type BinZone = "far" | "near" | "over";

type Rect = { left: number; top: number; right: number; bottom: number };

/** Where the pointer is relative to the bin: inside the (padded) drop zone, close, or far. */
export function binZone(point: { x: number; y: number }, bin: Rect): BinZone {
  if (
    point.x >= bin.left - DROP_PADDING &&
    point.x <= bin.right + DROP_PADDING &&
    point.y >= bin.top - DROP_PADDING &&
    point.y <= bin.bottom + DROP_PADDING
  ) {
    return "over";
  }
  const cx = (bin.left + bin.right) / 2;
  const cy = (bin.top + bin.bottom) / 2;
  return Math.hypot(point.x - cx, point.y - cy) <= NEAR_DISTANCE ? "near" : "far";
}

function resetBody() {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

type Phase = "idle" | "dragging" | "returning" | "shredding";

function GhostCard({ label, summary }: { label: string; summary: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-card-foreground">
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
      </div>
    </div>
  );
}

/** The preview cut into vertical strips that fall into the bin one after another. */
function Shreds({
  label,
  summary,
  onDone,
}: {
  label: string;
  summary: string;
  onDone: () => void;
}) {
  const width = 100 / STRIPS;
  return (
    <div className="relative">
      {Array.from({ length: STRIPS }, (_, index) => (
        <motion.div
          key={index}
          className={index === 0 ? "relative" : "absolute inset-0"}
          style={{
            clipPath: `inset(0 ${100 - (index + 1) * width}% 0 ${index * width}%)`,
          }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{
            y: 150 + (index % 3) * 18,
            opacity: 0,
            rotate: (index % 2 === 0 ? 1 : -1) * (2 + (index % 3)),
          }}
          // Starts once the preview reached the bin's mouth (`FEED_DURATION`).
          transition={{
            duration: 0.55,
            delay: FEED_DURATION + index * 0.035,
            ease: [0.55, 0, 0.75, 0.2],
          }}
          onAnimationComplete={index === STRIPS - 1 ? onDone : undefined}
        >
          <GhostCard label={label} summary={summary} />
        </motion.div>
      ))}
    </div>
  );
}

function Bin({ zone, binRef }: { zone: BinZone; binRef: Ref<HTMLDivElement> }) {
  const over = zone === "over";
  return (
    <motion.div
      ref={binRef}
      aria-hidden
      data-field-bin={zone}
      className={cn(
        "pointer-events-none fixed right-6 bottom-6 z-[61] flex size-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card shadow-lg transition-colors duration-200",
        over
          ? "border-destructive bg-destructive/10 text-destructive"
          : zone === "near"
            ? "border-destructive/50 text-foreground"
            : "border-dashed border-border text-muted-foreground",
      )}
      initial={{ opacity: 0, scale: 0.8, y: 16 }}
      animate={{ opacity: 1, scale: over ? 1.08 : zone === "near" ? 1.03 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 16 }}
      transition={MOTION.layout}
    >
      {/* The shredder's mouth: widens when the field is about to be dropped. */}
      <motion.span
        className={cn(
          "absolute top-2 h-1.5 rounded-full",
          over ? "bg-destructive" : "bg-muted-foreground/30",
        )}
        animate={{ width: over ? 80 : zone === "near" ? 64 : 48 }}
        transition={MOTION.layout}
      />
      <motion.span
        animate={over ? { rotate: [0, -12, 10, -6, 0], y: -2 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <Trash2 className="size-7" />
      </motion.span>
      <span className="px-2 text-center text-xs leading-tight font-medium">
        {over ? t.release : t.dropHere}
      </span>
    </motion.div>
  );
}

function setPosition(x: MotionValue<number>, y: MotionValue<number>, px: number, py: number) {
  x.set(px - GRAB_OFFSET.x);
  y.set(py - GRAB_OFFSET.y);
}

/**
 * Drag handle that clears a field by dropping it on a bin in the bottom-right corner. Dropping
 * anywhere else, pressing Escape or losing the pointer cancels without touching the data; only a
 * drop on the bin calls `onShred` (the same clear as the field menu, with its undo toast). The
 * clear happens on drop, never on unmount, so an interrupted drag can never delete anything.
 */
export function FieldShredHandle({
  label,
  summary,
  onShred,
  onLiftChange,
}: {
  label: string;
  summary: string;
  onShred: () => void;
  /** Lets the card dim itself while its value is being dragged. */
  onLiftChange: (lifted: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [zone, setZone] = useState<BinZone>("far");
  // What the preview shows, frozen when the drag starts (the field is cleared before it ends).
  const [preview, setPreview] = useState({ label, summary });
  // The bin's portal stays mounted until its exit animation is over.
  const [binMounted, setBinMounted] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const binRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ id: number; startX: number; startY: number; dragging: boolean } | null>(
    null,
  );
  const zoneRef = useRef<BinZone>("far");
  const mounted = useRef(true);
  const lifted = useRef(false);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup.current();
      if (lifted.current) resetBody();
    };
  }, []);

  const lift = (on: boolean) => {
    lifted.current = on;
    document.body.style.cursor = on ? "grabbing" : "";
    document.body.style.userSelect = on ? "none" : "";
    onLiftChange(on);
  };

  const updateZone = (next: BinZone) => {
    if (zoneRef.current === next) return;
    zoneRef.current = next;
    setZone(next);
  };

  const finish = () => {
    if (!mounted.current) return;
    lift(false);
    updateZone("far");
    setPhase("idle");
  };

  const cancel = () => {
    const handle = handleRef.current?.getBoundingClientRect();
    setPhase("returning");
    if (!handle || reduceMotion) return finish();
    // Fly back to the field the value came from.
    void Promise.all([
      animate(x, handle.left - GRAB_OFFSET.x + handle.width / 2, MOTION.layout),
      animate(y, handle.top - GRAB_OFFSET.y + handle.height / 2, MOTION.layout),
      animate(opacity, 0, { duration: 0.22, delay: 0.08 }),
    ]).then(finish);
  };

  const shred = () => {
    setPhase("shredding");
    onShred();
    const bin = binRef.current?.getBoundingClientRect();
    const ghost = ghostRef.current?.getBoundingClientRect();
    if (!bin || !ghost || reduceMotion) {
      void animate(opacity, 0, { duration: 0.15 }).then(finish);
      return;
    }
    // Feed the preview into the mouth of the bin; the strips then fall behind it (see `Shreds`,
    // which calls `finish` when the last strip is gone).
    const feed = { duration: FEED_DURATION, ease: EASE_OUT };
    animate(scale, 0.6, feed);
    animate(x, bin.left + bin.width / 2 - GHOST_WIDTH / 2, feed);
    animate(y, bin.top - ghost.height * 0.35, feed);
  };

  const end = (dropped: boolean) => {
    cleanup.current();
    const wasDragging = press.current?.dragging ?? false;
    press.current = null;
    if (!wasDragging) return;
    if (dropped && zoneRef.current === "over") shred();
    else cancel();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || phase !== "idle") return;
    event.preventDefault(); // no text selection or focus change from the press itself
    press.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };

    const onMove = (move: PointerEvent) => {
      const current = press.current;
      if (!current || move.pointerId !== current.id) return;
      if (!current.dragging) {
        if (
          Math.hypot(move.clientX - current.startX, move.clientY - current.startY) < DRAG_THRESHOLD
        ) {
          return;
        }
        current.dragging = true;
        scale.set(1);
        opacity.set(1);
        lift(true);
        setPreview({ label, summary });
        setBinMounted(true);
        setPhase("dragging");
      }
      setPosition(x, y, move.clientX, move.clientY);
      const bin = binRef.current?.getBoundingClientRect();
      if (bin) updateZone(binZone({ x: move.clientX, y: move.clientY }, bin));
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId === press.current?.id) end(true);
    };
    const onCancel = (cancelled: PointerEvent) => {
      if (cancelled.pointerId === press.current?.id) end(false);
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || !press.current?.dragging) return;
      key.preventDefault();
      key.stopPropagation();
      end(false);
    };
    const onBlur = () => end(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    cleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      cleanup.current = () => {};
    };
  };

  const active = phase !== "idle";

  return (
    <>
      <div
        ref={handleRef}
        aria-hidden
        title={t.handle}
        data-field-drag-handle
        onPointerDown={onPointerDown}
        className={cn(
          "flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,opacity] duration-150 select-none hover:bg-accent hover:text-foreground active:cursor-grabbing",
          active ? "opacity-100" : "opacity-60 group-hover/field:opacity-100",
        )}
      >
        <GripVertical className="size-4" />
      </div>
      {active &&
        createPortal(
          <>
            <motion.div
              ref={ghostRef}
              aria-hidden
              className={cn(
                "pointer-events-none fixed top-0 left-0 origin-top",
                phase === "shredding" ? "z-[60]" : "z-[62]",
              )}
              style={{ x, y, scale, opacity, width: GHOST_WIDTH }}
            >
              {phase === "shredding" && !reduceMotion ? (
                <Shreds label={preview.label} summary={preview.summary} onDone={finish} />
              ) : (
                <motion.div
                  className="rounded-xl shadow-xl"
                  initial={{ scale: 0.92, rotate: 0 }}
                  animate={{ scale: 1, rotate: zone === "over" ? -3 : -1.5 }}
                  transition={MOTION.layout}
                >
                  <GhostCard label={preview.label} summary={preview.summary} />
                </motion.div>
              )}
            </motion.div>
          </>,
          document.body,
        )}
      {binMounted &&
        createPortal(
          <AnimatePresence onExitComplete={() => setBinMounted(false)}>
            {(phase === "dragging" || phase === "shredding") && (
              <Bin key="bin" zone={phase === "shredding" ? "over" : zone} binRef={binRef} />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

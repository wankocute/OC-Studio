import { cn } from "@/lib/utils";

/** Validation message (or hint) shown right under the control it belongs to. */
export function FieldMessage({
  id,
  message,
  tone = "error",
  className,
}: {
  id?: string;
  message?: string;
  tone?: "error" | "hint";
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      className={cn(
        "text-xs",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {message}
    </p>
  );
}

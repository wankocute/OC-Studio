import type { Route } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Presentation-only props. Intentionally decoupled from the (not yet defined) character
 * domain model: a mapper will build these from real records in a later task.
 */
export type CharacterCardProps = {
  name: string;
  summary?: string;
  tags?: readonly string[];
  /** Pre-formatted, locale-aware label, e.g. "3 ngày trước". */
  updatedLabel?: string;
  href?: Route;
  className?: string;
};

const MAX_VISIBLE_TAGS = 3;

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? [words[0], words.at(-1)] : words;
  return initials
    .map((word) => word?.[0]?.toLocaleUpperCase("vi") ?? "")
    .join("")
    .slice(0, 2);
}

export function CharacterCard({
  name,
  summary,
  tags = [],
  updatedLabel,
  href,
  className,
}: CharacterCardProps) {
  const displayName = name.trim() || messages.characters.untitled;
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = tags.length - visibleTags.length;

  return (
    <Card
      className={cn(
        "relative h-full transition-shadow",
        href && "focus-within:ring-2 focus-within:ring-ring hover:ring-foreground/20",
        className,
      )}
    >
      <CardHeader className="flex items-center gap-3">
        <div
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent font-heading text-base font-semibold text-accent-foreground"
        >
          {getInitials(displayName) || "?"}
        </div>
        <div className="min-w-0">
          <CardTitle className="truncate">
            {href ? (
              <Link href={href} className="outline-none after:absolute after:inset-0">
                {displayName}
              </Link>
            ) : (
              displayName
            )}
          </CardTitle>
          {updatedLabel && (
            <CardDescription className="text-xs">
              {messages.characters.updatedAt} {updatedLabel}
            </CardDescription>
          )}
        </div>
      </CardHeader>

      {(summary || visibleTags.length > 0) && (
        <CardContent className="space-y-3">
          {summary && <p className="line-clamp-3 text-sm text-muted-foreground">{summary}</p>}
          {visibleTags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => (
                <li key={tag}>
                  <Badge variant="secondary">{tag}</Badge>
                </li>
              ))}
              {hiddenTagCount > 0 && (
                <li>
                  <Badge variant="outline">+{hiddenTagCount}</Badge>
                </li>
              )}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

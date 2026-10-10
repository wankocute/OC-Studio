import { Star } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CharacterAvatar } from "@/components/shared/character-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

/** Presentation-only props; `listLibraryCharacters` provides the data. */
export type CharacterCardProps = {
  name: string;
  summary?: string;
  tags?: readonly string[];
  /** Pre-formatted, locale-aware label. */
  updatedLabel?: string;
  href?: Route;
  avatarMediaId?: string | null;
  isFavorite?: boolean;
  /** Interactive controls (favourite, menu) rendered above the card's link overlay. */
  actions?: ReactNode;
  className?: string;
};

const MAX_VISIBLE_TAGS = 3;

export function CharacterCard({
  name,
  summary,
  tags = [],
  updatedLabel,
  href,
  avatarMediaId,
  isFavorite = false,
  actions,
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
        <CharacterAvatar name={displayName} mediaId={avatarMediaId} size="md" />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-1.5">
            <span className="truncate">
              {href ? (
                <Link href={href} className="outline-none after:absolute after:inset-0">
                  {displayName}
                </Link>
              ) : (
                displayName
              )}
            </span>
            {isFavorite && (
              <Star
                className="size-3.5 shrink-0 fill-warning text-warning"
                aria-label={messages.characters.favorite}
              />
            )}
          </CardTitle>
          {updatedLabel && (
            <CardDescription className="text-xs">
              {messages.characters.updatedAt} {updatedLabel}
            </CardDescription>
          )}
        </div>
        {actions && <div className="relative z-10 flex shrink-0 items-center gap-1">{actions}</div>}
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

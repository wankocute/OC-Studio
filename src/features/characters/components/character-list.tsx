import { Star } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CharacterAvatar } from "@/components/shared/character-avatar";
import { Badge } from "@/components/ui/badge";
import type { CharacterCardData } from "@/features/characters/server/library-queries";
import type { LibraryView } from "@/features/characters/library-params";
import { messages } from "@/i18n";
import { formatDate } from "@/lib/format";

import { DeleteCharacterButton, FavoriteButton } from "./character-actions";
import { CharacterCard } from "./character-card";

const t = messages.characters;

type CharacterListProps = {
  characters: CharacterCardData[];
  view?: LibraryView;
  /** Extra per-character control (e.g. "remove from collection"). */
  renderExtraAction?: (character: CharacterCardData) => ReactNode;
  /** Show favourite/delete controls (off for compact read-only lists). */
  withActions?: boolean;
};

function Actions({ character, extra }: { character: CharacterCardData; extra?: ReactNode }) {
  return (
    <>
      <FavoriteButton characterId={character.id} isFavorite={character.isFavorite} />
      <DeleteCharacterButton
        characterId={character.id}
        revision={character.revision}
        name={character.displayName}
        compact
      />
      {extra}
    </>
  );
}

export function CharacterList({
  characters,
  view = "grid",
  renderExtraAction,
  withActions = true,
}: CharacterListProps) {
  if (view === "list") {
    return (
      <ul className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {characters.map((character) => (
          <li
            key={character.id}
            className="relative flex items-center gap-3 px-4 py-3 focus-within:bg-muted/60 hover:bg-muted/40"
          >
            <CharacterAvatar
              name={character.displayName}
              mediaId={character.avatarMediaId}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/characters/${character.id}` as Route}
                  className="truncate font-medium outline-none after:absolute after:inset-0"
                >
                  {character.displayName}
                </Link>
                {character.isFavorite && (
                  <Star
                    className="size-3.5 shrink-0 fill-warning text-warning"
                    aria-label={t.favorite}
                  />
                )}
              </div>
              {character.summary.length > 0 && (
                <p className="truncate text-sm text-muted-foreground">
                  {character.summary.join(" · ")}
                </p>
              )}
            </div>
            <div className="hidden max-w-56 flex-wrap justify-end gap-1 md:flex">
              {character.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {formatDate(character.updatedAt)}
            </span>
            {withActions && (
              <div className="relative z-10 flex shrink-0 items-center">
                <Actions character={character} extra={renderExtraAction?.(character)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => (
        <li key={character.id}>
          <CharacterCard
            name={character.displayName}
            href={`/characters/${character.id}` as Route}
            summary={character.summary.join(" · ") || undefined}
            tags={character.tags.map((tag) => tag.name)}
            updatedLabel={formatDate(character.updatedAt)}
            avatarMediaId={character.avatarMediaId}
            isFavorite={character.isFavorite}
            actions={
              withActions ? (
                <Actions character={character} extra={renderExtraAction?.(character)} />
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function CharacterListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy
      aria-label={messages.common.loading}
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="h-32 animate-pulse rounded-xl bg-muted/70" />
      ))}
    </ul>
  );
}

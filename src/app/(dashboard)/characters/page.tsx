import { BookUser, SearchX } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { CreateCharacterButton } from "@/features/characters/components/character-actions";
import {
  CharacterList,
  CharacterListSkeleton,
} from "@/features/characters/components/character-list";
import { LibraryToolbar } from "@/features/characters/components/library-toolbar";
import {
  DEFAULT_LIBRARY_PARAMS,
  hasActiveFilters,
  libraryQueryString,
  parseLibraryParams,
} from "@/features/characters/library-params";
import { listLibraryCharacters } from "@/features/characters/server/library-queries";
import { createTagRepository } from "@/features/library/server/tag-repository";
import { messages } from "@/i18n";

const t = messages.characters;

export const metadata: Metadata = { title: t.title };

async function Library({
  searchParams,
}: {
  searchParams: PageProps<"/characters">["searchParams"];
}) {
  const params = parseLibraryParams(await searchParams);
  const db = getDb();
  const [characters, tags] = await Promise.all([
    listLibraryCharacters(db, {
      q: params.q,
      sort: params.sort,
      favorites: params.favorites,
      tagId: params.tagId,
    }),
    createTagRepository(db).list(),
  ]);
  const filtered = hasActiveFilters(params);

  return (
    <div className="space-y-5">
      <LibraryToolbar params={params} tags={tags.map(({ id, name }) => ({ id, name }))} />

      {characters.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title={t.noResultsTitle}
            description={t.noResultsBody}
            action={
              <Button asChild variant="outline">
                <Link
                  href={
                    `/characters${libraryQueryString({ ...DEFAULT_LIBRARY_PARAMS, sort: params.sort, view: params.view })}` as Route
                  }
                >
                  {t.clearFilters}
                </Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={BookUser}
            title={t.emptyTitle}
            description={t.emptyBody}
            action={<CreateCharacterButton />}
          />
        )
      ) : (
        <section aria-label={t.title} className="space-y-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t.resultCount(characters.length)}
          </p>
          <CharacterList characters={characters} view={params.view} layoutTransitions />
        </section>
      )}
    </div>
  );
}

export default function CharactersPage(props: PageProps<"/characters">) {
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} actions={<CreateCharacterButton />} />
      <Suspense
        fallback={
          <div className="space-y-5">
            <div className="h-9 w-full max-w-sm animate-pulse rounded-lg bg-muted/70" />
            <CharacterListSkeleton />
          </div>
        }
      >
        <Library searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

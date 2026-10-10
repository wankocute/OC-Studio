import { ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import {
  CharacterList,
  CharacterListSkeleton,
} from "@/features/characters/components/character-list";
import { listLibraryCharacters } from "@/features/characters/server/library-queries";
import {
  AddCharacterToCollection,
  DeleteCollectionButton,
  EditCollectionButton,
  RemoveFromCollectionButton,
} from "@/features/library/components/collection-actions";
import { createCollectionRepository } from "@/features/library/server/collection-repository";
import { messages } from "@/i18n";

const t = messages.collections;

export const metadata: Metadata = { title: t.title };

async function CollectionDetail({ params }: { params: PageProps<"/collections/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();

  let collection;
  try {
    collection = await createCollectionRepository(db).get(id);
  } catch (error) {
    if (isRepositoryError(error, "not_found")) notFound();
    throw error;
  }
  const [members, everyone] = await Promise.all([
    listLibraryCharacters(db, { collectionId: id, sort: "name" }),
    listLibraryCharacters(db, { sort: "name" }),
  ]);
  const memberIds = new Set(members.map((member) => member.id));
  const candidates = everyone
    .filter((character) => !memberIds.has(character.id))
    .map(({ id: characterId, displayName }) => ({ id: characterId, displayName }));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/collections">
          <ArrowLeft data-icon="inline-start" aria-hidden />
          {t.title}
        </Link>
      </Button>
      <PageHeader
        title={collection.name}
        description={collection.description ?? t.characterCount(members.length)}
        actions={
          <>
            <EditCollectionButton collection={collection} />
            <DeleteCollectionButton collection={collection} redirectToList />
            <AddCharacterToCollection collectionId={collection.id} candidates={candidates} />
          </>
        }
      />
      {members.length === 0 ? (
        <EmptyState icon={Users} title={t.membersEmptyTitle} description={t.membersEmptyBody} />
      ) : (
        <CharacterList
          characters={members}
          renderExtraAction={(character) => (
            <RemoveFromCollectionButton collectionId={collection.id} character={character} />
          )}
        />
      )}
    </div>
  );
}

export default function CollectionPage(props: PageProps<"/collections/[id]">) {
  return (
    <Suspense fallback={<CharacterListSkeleton count={3} />}>
      <CollectionDetail params={props.params} />
    </Suspense>
  );
}

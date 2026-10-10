import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { FactEditor } from "@/features/characters/components/editor/fact-editor";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import {
  listCharacterNames,
  listRelationshipSourcesTo,
} from "@/features/characters/server/editor-queries";
import { createLibraryDefinitionRepository } from "@/features/characters/server/library-definition-repository";
import { messages } from "@/i18n";

export const metadata: Metadata = { title: messages.editor.pageTitle };

const idSchema = z.uuid();

async function load(id: string) {
  const db = getDb();
  const definitions = createLibraryDefinitionRepository(db);
  try {
    const [record, library, fields, characters, linkingBack] = await Promise.all([
      createCharacterRepository(db).getById(id),
      definitions.load(),
      definitions.listFields(),
      listCharacterNames(db),
      listRelationshipSourcesTo(db, id),
    ]);
    return { record, library, fields, characters, linkingBack };
  } catch (error) {
    if (isRepositoryError(error, "not_found")) notFound();
    throw error;
  }
}

async function EditorLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/characters/[id]/edit">["params"];
  searchParams: PageProps<"/characters/[id]/edit">["searchParams"];
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const query = await searchParams;
  const group = typeof query.group === "string" ? query.group : undefined;
  const reverseOf =
    typeof query.reverseOf === "string" && idSchema.safeParse(query.reverseOf).success
      ? query.reverseOf
      : undefined;

  const { record, library, fields, characters, linkingBack } = await load(id);
  return (
    // Next.js keeps visited pages mounted (Activity). Keying on the revision gives a fresh editor
    // when the stored sheet changed since it was last shown, and keeps local drafts otherwise.
    <FactEditor
      key={`${record.id}:${record.revision}`}
      characterId={record.id}
      loaded={{
        facts: record.facts,
        revision: record.revision,
        ...(record.pendingMigration ? { pendingMigration: record.pendingMigration } : {}),
      }}
      library={library}
      deprecatedLibraryKeys={fields
        .filter((field) => field.status === "deprecated")
        .map((field) => field.definition.key)}
      characters={characters}
      linkingBack={linkingBack}
      initialSection={group}
      reverseOf={reverseOf}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label={messages.common.loading}>
      <div className="h-14 animate-pulse rounded-xl bg-muted/70" />
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="hidden h-96 animate-pulse rounded-xl bg-muted/70 lg:block" />
        <div className="h-96 animate-pulse rounded-xl bg-muted/70" />
      </div>
    </div>
  );
}

export default function FactEditorPage(props: PageProps<"/characters/[id]/edit">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorLoader params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

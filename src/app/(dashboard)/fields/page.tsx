import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { getDb } from "@/db";
import { LibraryFieldsManager } from "@/features/characters/components/library-fields-manager";
import { countLibraryFieldUsage } from "@/features/characters/server/editor-queries";
import { createLibraryDefinitionRepository } from "@/features/characters/server/library-definition-repository";
import { messages } from "@/i18n";

const t = messages.libraryFields;

export const metadata: Metadata = { title: t.title };

async function LibraryFields() {
  const db = getDb();
  const repository = createLibraryDefinitionRepository(db);
  const [fields, library, usage] = await Promise.all([
    repository.listFields(),
    repository.load(),
    countLibraryFieldUsage(db),
  ]);
  return (
    <LibraryFieldsManager
      library={library}
      rows={fields.map((field) => ({
        definition: field.definition,
        status: field.status,
        usage: usage[field.definition.key] ?? 0,
      }))}
    />
  );
}

export default function LibraryFieldsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title={t.title} description={t.description} />
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted/70" aria-busy />}>
        <LibraryFields />
      </Suspense>
    </div>
  );
}

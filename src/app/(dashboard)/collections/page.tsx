import { LibraryBig } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import {
  CreateCollectionButton,
  DeleteCollectionButton,
  EditCollectionButton,
} from "@/features/library/components/collection-actions";
import { createCollectionRepository } from "@/features/library/server/collection-repository";
import { messages } from "@/i18n";

const t = messages.collections;

export const metadata: Metadata = { title: t.title };

async function CollectionGrid() {
  const collections = await createCollectionRepository(getDb()).listWithCounts();
  if (collections.length === 0) {
    return (
      <EmptyState
        icon={LibraryBig}
        title={t.emptyTitle}
        description={t.emptyBody}
        action={<CreateCollectionButton />}
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {collections.map((collection) => (
        <li key={collection.id}>
          <Card className="relative h-full transition-shadow focus-within:ring-2 focus-within:ring-ring hover:ring-foreground/20">
            <CardHeader className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <LibraryBig className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <CardTitle className="truncate font-heading text-base">
                  <Link
                    href={`/collections/${collection.id}` as Route}
                    className="outline-none after:absolute after:inset-0"
                  >
                    {collection.name}
                  </Link>
                </CardTitle>
                <CardDescription>{t.characterCount(collection.characterCount)}</CardDescription>
                {collection.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                )}
              </div>
              <div className="relative z-10 flex shrink-0">
                <EditCollectionButton collection={collection} compact />
                <DeleteCollectionButton collection={collection} compact />
              </div>
            </CardHeader>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default function CollectionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={<CreateCollectionButton />}
      />
      <Suspense
        fallback={
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="h-24 animate-pulse rounded-xl bg-muted/70" />
            ))}
          </ul>
        }
      >
        <CollectionGrid />
      </Suspense>
    </div>
  );
}

import {
  ArrowRight,
  BookUser,
  Feather,
  LibraryBig,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { CreateCharacterButton } from "@/features/characters/components/character-actions";
import {
  CharacterList,
  CharacterListSkeleton,
} from "@/features/characters/components/character-list";
import {
  getLibraryStats,
  listLibraryCharacters,
} from "@/features/characters/server/library-queries";
import { AiStatus, AiStatusFallback } from "@/features/system-status/components/ai-status";
import {
  DatabaseStatus,
  DatabaseStatusFallback,
} from "@/features/system-status/components/database-status";
import { StatusRow } from "@/features/system-status/components/status-row";
import { messages } from "@/i18n";

const t = messages.dashboard;
const RECENT_LIMIT = 5;

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col-reverse">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-heading text-2xl font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Library numbers and recent characters. A database failure is shown in place, so the rest of
 * the dashboard (including the PostgreSQL status) keeps working.
 */
async function LibraryOverview() {
  let stats, recent;
  try {
    const db = getDb();
    [stats, recent] = await Promise.all([
      getLibraryStats(db),
      listLibraryCharacters(db, { sort: "updated", limit: RECENT_LIMIT }),
    ]);
  } catch {
    return (
      <EmptyState
        icon={TriangleAlert}
        title={messages.common.errorTitle}
        description={messages.common.errorBody}
      />
    );
  }
  return (
    <>
      <dl aria-label={t.statsLabel} className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Users} label={t.statCharacters} value={stats.characters} />
        <Stat icon={Star} label={t.statFavorites} value={stats.favorites} />
        <Stat icon={LibraryBig} label={t.statCollections} value={stats.collections} />
      </dl>
      <section aria-labelledby="recent-characters" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="recent-characters" className="font-heading text-lg font-semibold">
            {t.recentTitle}
          </h2>
          {recent.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/characters">
                {t.viewAll}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={BookUser}
            title={t.emptyTitle}
            description={t.emptyBody}
            action={<CreateCharacterButton />}
          />
        ) : (
          <CharacterList characters={recent} />
        )}
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title={t.title}
        description={messages.app.description}
        actions={<CreateCharacterButton />}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Feather className="size-5" aria-hidden />
            </div>
            <CardTitle className="text-xl font-semibold">{t.welcomeTitle}</CardTitle>
            <CardDescription className="max-w-prose text-pretty">{t.welcomeBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/characters">
                <BookUser data-icon="inline-start" aria-hidden />
                {t.openLibrary}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.statusTitle}</CardTitle>
            <CardDescription>{t.statusDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <StatusRow
                label={messages.status.application}
                tone="success"
                value={messages.status.applicationReady}
              />
              <Suspense fallback={<DatabaseStatusFallback />}>
                <DatabaseStatus />
              </Suspense>
              <Suspense fallback={<AiStatusFallback />}>
                <AiStatus />
              </Suspense>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Suspense
        fallback={
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-3" aria-busy>
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-[74px] animate-pulse rounded-xl bg-muted/70" />
              ))}
            </div>
            <CharacterListSkeleton count={3} />
          </div>
        }
      >
        <LibraryOverview />
      </Suspense>
    </div>
  );
}

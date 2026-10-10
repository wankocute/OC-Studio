import { ArrowLeft, BookOpenText } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { fingerprint } from "@/features/characters/domain";
import { ProfileWorkspace } from "@/features/profiles/components/profile-workspace";
import { StartProfileButton } from "@/features/profiles/components/start-profile";
import { loadFactSources } from "@/features/profiles/server/fact-source-loader";
import { createProfileRepository } from "@/features/profiles/server/profile-repository";
import { toProfileView } from "@/features/profiles/server/profile-views";
import { messages } from "@/i18n";

const t = messages.profiles;

export const metadata: Metadata = { title: t.pageTitle };

async function load(characterId: string) {
  const db = getDb();
  try {
    const [{ character, sources }, profile] = await Promise.all([
      loadFactSources(db, characterId),
      createProfileRepository(db).getPrimary(characterId),
    ]);
    return { character, sources, profile };
  } catch (error) {
    if (isRepositoryError(error, "not_found")) notFound();
    throw error;
  }
}

async function ProfileLoader({
  params,
  searchParams,
}: {
  params: PageProps<"/characters/[id]/profile">["params"];
  searchParams: PageProps<"/characters/[id]/profile">["searchParams"];
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const section = typeof query.section === "string" ? query.section : undefined;
  const { character, sources, profile } = await load(id);
  const name = character.facts.displayName;

  if (!profile) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/characters/${id}` as Route}>
            <ArrowLeft data-icon="inline-start" aria-hidden />
            {t.back}
          </Link>
        </Button>
        <h1 className="font-heading text-3xl font-semibold tracking-tight break-words">{name}</h1>
        <EmptyState
          icon={BookOpenText}
          title={t.start.title}
          description={t.start.body}
          action={<StartProfileButton characterId={id} />}
        />
      </div>
    );
  }

  const view = toProfileView(profile, sources);
  // Next.js keeps visited pages mounted (Activity). Keying on the stored state gives a fresh
  // workspace when anything changed since it was last shown, and keeps local drafts otherwise.
  const version = fingerprint([
    profile.revision,
    name,
    profile.sections.map((item) => [item.id, item.draftRevision, item.approved?.revisionId]),
  ]);
  return (
    <ProfileWorkspace
      key={`${profile.id}:${version}`}
      name={name}
      profile={view}
      sourceGroups={sources.groups}
      initialSection={section}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label={messages.common.loading}>
      <div className="h-14 animate-pulse rounded-xl bg-muted/70" />
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="hidden h-96 animate-pulse rounded-xl bg-muted/70 lg:block" />
        <div className="h-96 animate-pulse rounded-xl bg-muted/70" />
      </div>
    </div>
  );
}

export default function ProfilePage(props: PageProps<"/characters/[id]/profile">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileLoader params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

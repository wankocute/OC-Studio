import { ArrowLeft, BookOpenText, FileText, Info, LibraryBig, Tag } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { toBasicInfoForm, summarizeCharacter } from "@/features/characters/basic-info";
import { BasicInfoView } from "@/features/characters/components/basic-info-view";
import {
  DeleteCharacterButton,
  EditBasicInfoButton,
  FavoriteButton,
} from "@/features/characters/components/character-actions";
import { factLabelsVi } from "@/features/characters/domain";
import { createCharacterRepository } from "@/features/characters/server/character-repository";
import { CollectionPicker } from "@/features/library/components/collection-picker";
import { TagPicker } from "@/features/library/components/tag-picker";
import { createCollectionRepository } from "@/features/library/server/collection-repository";
import { createMediaRepository } from "@/features/library/server/media-repository";
import { createTagRepository } from "@/features/library/server/tag-repository";
import { AvatarEditor, ReferenceGallery } from "@/features/media/components/character-images";
import { createProfileRepository } from "@/features/profiles/server/profile-repository";
import { messages } from "@/i18n";
import { formatDateTime } from "@/lib/format";

const t = messages.characters;

export const metadata: Metadata = { title: t.detailTitle };

async function loadCharacter(id: string) {
  const db = getDb();
  try {
    const [record, media, tags, allTags, collections, allCollections, profile] = await Promise.all([
      createCharacterRepository(db).getById(id),
      createMediaRepository(db).listForCharacter(id),
      createTagRepository(db).listForCharacter(id),
      createTagRepository(db).list(),
      createCollectionRepository(db).listForCharacter(id),
      createCollectionRepository(db).list(),
      createProfileRepository(db).getPrimarySummary(id),
    ]);
    return { record, media, tags, allTags, collections, allCollections, profile };
  } catch (error) {
    if (isRepositoryError(error, "not_found")) notFound();
    throw error;
  }
}

async function CharacterDetail({ params }: { params: PageProps<"/characters/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { record, media, tags, allTags, collections, allCollections, profile } =
    await loadCharacter(id);
  const { facts } = record;
  const name = facts.displayName;
  const toImage = (item: (typeof media)[number]) => ({
    mediaId: item.mediaId,
    width: item.width,
    height: item.height,
    originalFilename: item.originalFilename,
  });
  const avatar = media.find((item) => item.role === "avatar");
  const references = media.filter((item) => item.role === "reference").map(toImage);
  const summary = summarizeCharacter(facts.values);
  const factCount = Object.keys(facts.values).length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/characters">
          <ArrowLeft data-icon="inline-start" aria-hidden />
          {t.backToLibrary}
        </Link>
      </Button>

      {record.pendingMigration && (
        <section
          aria-labelledby="migration-title"
          className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <h2 id="migration-title" className="flex items-center gap-2 font-medium">
            <Info className="size-4 text-warning" aria-hidden />
            {t.migrationTitle}
          </h2>
          <p className="mt-1 text-muted-foreground">{t.migrationBody}</p>
          {record.pendingMigration.review.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {record.pendingMigration.review.map((item) => (
                <li key={`${item.key}-${item.reason}`}>
                  <span className="font-medium">
                    {factLabelsVi.fields[item.key as keyof typeof factLabelsVi.fields] ?? item.key}
                  </span>
                  : {t.migrationReasons[item.reason]}
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/characters/${record.id}/edit` as Route}>{t.reviewInEditor}</Link>
          </Button>
        </section>
      )}

      <header className="flex flex-col gap-6 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 sm:flex-row sm:items-center md:p-6">
        <AvatarEditor
          characterId={record.id}
          name={name}
          avatar={avatar ? toImage(avatar) : null}
        />
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <h1 className="font-heading text-3xl font-semibold tracking-tight break-words md:text-4xl">
            {name}
          </h1>
          {summary.length > 0 && <p className="text-muted-foreground">{summary.join(" · ")}</p>}
          <div className="flex flex-wrap justify-center gap-2 pt-2 sm:justify-start">
            <FavoriteButton characterId={record.id} isFavorite={record.isFavorite} size="icon" />
            <EditBasicInfoButton
              characterId={record.id}
              revision={record.revision}
              initial={toBasicInfoForm(facts)}
            />
            <DeleteCharacterButton
              characterId={record.id}
              revision={record.revision}
              name={name}
              redirectToLibrary
            />
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">{t.basicInfo}</CardTitle>
              <CardDescription>{t.basicInfoDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <BasicInfoView facts={facts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <BookOpenText className="size-4 text-muted-foreground" aria-hidden />
                {messages.profiles.title}
              </CardTitle>
              <CardDescription>{messages.profiles.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {profile
                  ? messages.profiles.summary(profile.approved, profile.sections)
                  : messages.profiles.notStarted}
              </p>
              <Button asChild>
                <Link href={`/characters/${record.id}/profile` as Route}>
                  <BookOpenText data-icon="inline-start" aria-hidden />
                  {messages.profiles.openProfile}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">{messages.media.references}</CardTitle>
              <CardDescription>{messages.media.referencesDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReferenceGallery characterId={record.id} name={name} images={references} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                {t.factEditor}
              </CardTitle>
              <CardDescription>{t.factEditorDescription}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t.factCount(factCount)}</p>
              <Button asChild>
                <Link href={`/characters/${record.id}/edit` as Route}>
                  <FileText data-icon="inline-start" aria-hidden />
                  {t.openFactEditor}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <Tag className="size-4 text-muted-foreground" aria-hidden />
                {messages.tags.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TagPicker
                characterId={record.id}
                selected={tags.map(({ id: tagId, name: tagName }) => ({
                  id: tagId,
                  name: tagName,
                }))}
                available={allTags.map(({ id: tagId, name: tagName }) => ({
                  id: tagId,
                  name: tagName,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading text-lg">
                <LibraryBig className="size-4 text-muted-foreground" aria-hidden />
                {messages.collections.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CollectionPicker
                characterId={record.id}
                selected={collections}
                available={allCollections.map(({ id: collectionId, name: collectionName }) => ({
                  id: collectionId,
                  name: collectionName,
                }))}
              />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{t.meta}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{messages.common.createdAt}</dt>
                  <dd>{formatDateTime(record.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{messages.common.updatedAt}</dt>
                  <dd>{formatDateTime(record.updatedAt)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label={messages.common.loading}>
      <div className="h-40 animate-pulse rounded-2xl bg-muted/70" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-muted/70 lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/70" />
      </div>
    </div>
  );
}

export default function CharacterPage(props: PageProps<"/characters/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CharacterDetail params={props.params} />
    </Suspense>
  );
}

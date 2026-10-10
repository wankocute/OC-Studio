import { ArrowLeft, Info } from "lucide-react";
import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { isRepositoryError } from "@/db/repository-errors";
import { PrintButton } from "@/features/profiles/components/print-button";
import { RichTextView } from "@/features/profiles/components/rich-text-view";
import { DEFAULT_PRINT_SOURCE, PRINT_SOURCES, type PrintSource } from "@/features/profiles/print";
import { loadPrintView, type PrintAvatar } from "@/features/profiles/server/print-loader";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

const t = messages.profiles.print;

export const metadata: Metadata = { title: t.pageTitle };

const querySchema = z.object({ source: z.enum(PRINT_SOURCES).optional() });

const printHref = (id: string, source: PrintSource) =>
  `/characters/${id}/profile/print?source=${source}` as Route;

async function load(id: string, source: PrintSource) {
  try {
    return await loadPrintView(getDb(), id, source);
  } catch (error) {
    if (isRepositoryError(error, "not_found")) notFound();
    throw error;
  }
}

/** Keeps the image's aspect ratio inside a 45 mm box; unknown sizes are treated as square. */
function Avatar({ avatar, name }: { avatar: PrintAvatar; name: string }) {
  const width = avatar.width ?? 400;
  const height = avatar.height ?? 400;
  return (
    <Image
      src={`/media/${avatar.mediaId}`}
      alt={messages.media.avatarAlt(name)}
      width={width}
      height={height}
      unoptimized
      className="h-auto max-h-24 w-auto max-w-32 shrink-0 rounded-md object-contain sm:max-h-[45mm] sm:max-w-[45mm]"
    />
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

async function PrintView({
  params,
  searchParams,
}: {
  params: PageProps<"/characters/[id]/profile/print">["params"];
  searchParams: PageProps<"/characters/[id]/profile/print">["searchParams"];
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = querySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const source = query.data.source ?? DEFAULT_PRINT_SOURCE;
  const { name, avatar, plan } = await load(id, source);
  const sections = plan?.sections ?? [];
  const other: PrintSource = source === "approved" ? "draft" : "approved";

  return (
    <div className="min-h-svh bg-muted/40 print:min-h-0 print:bg-paper">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href={`/characters/${id}/profile` as Route}>
                <ArrowLeft data-icon="inline-start" aria-hidden />
                {t.back}
              </Link>
            </Button>
            <p className="font-medium" data-testid="print-source">
              {t.sources[source]}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={printHref(id, other)}>{t.switchTo(t.sources[other])}</Link>
            </Button>
            <div className="ml-auto">
              <PrintButton disabled={sections.length === 0} />
            </div>
          </div>
          {sections.length > 0 && (
            <div className="space-y-1">
              <Notice>
                {t.sectionsCount(sections.length)} {t.howTo}
              </Notice>
              {plan && plan.unapproved > 0 && <Notice>{t.unapproved(plan.unapproved)}</Notice>}
              {plan && plan.newerDraft > 0 && <Notice>{t.newerDraft(plan.newerDraft)}</Notice>}
            </div>
          )}
        </div>
      </div>

      <main className="px-3 py-6 sm:px-6 print:p-0">
        <article
          data-testid="print-document"
          className="print-document mx-auto w-full max-w-[210mm] px-5 py-8 shadow-sm ring-1 ring-foreground/10 sm:px-[16mm] sm:py-[18mm] print:max-w-none print:p-0 print:shadow-none print:ring-0"
        >
          <header className="flex flex-wrap items-center gap-5 border-b border-paper-rule pb-5">
            {avatar && <Avatar avatar={avatar} name={name} />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[9pt] tracking-wide text-paper-muted uppercase">{t.printedFrom}</p>
              <h1 className="text-[24pt] leading-tight font-bold break-words">{name}</h1>
              <p
                className={cn(
                  "text-[10pt]",
                  source === "draft" ? "font-semibold" : "text-paper-muted",
                )}
              >
                {source === "draft" ? t.draftBadge : t.approvedBadge}
              </p>
            </div>
          </header>

          {sections.length === 0 ? (
            <div className="py-10 text-center">
              <h2 className="text-[14pt] font-semibold">{t.emptyTitle}</h2>
              <p className="mt-2 text-paper-muted">
                {!plan ? t.noProfile : source === "approved" ? t.emptyApproved : t.emptyDraft}
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.id} className="mt-7">
                <h2 className="mb-3 border-b border-paper-rule pb-1 text-[16pt] font-bold">
                  {section.title}
                </h2>
                <RichTextView content={section.content} />
              </section>
            ))
          )}
        </article>
      </main>
    </div>
  );
}

function PrintSkeleton() {
  return (
    <div className="min-h-svh bg-muted/40 p-6" aria-busy aria-label={messages.common.loading}>
      <div className="mx-auto h-[60vh] max-w-[210mm] animate-pulse rounded-md bg-muted" />
    </div>
  );
}

export default function ProfilePrintPage(props: PageProps<"/characters/[id]/profile/print">) {
  return (
    <Suspense fallback={<PrintSkeleton />}>
      <PrintView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

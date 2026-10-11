"use client";

import { useState } from "react";

import { FadeIn } from "@/components/shared/fade-in";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { isDocumentEmpty } from "@/features/profiles/domain";
import { sectionLabel, type SectionStructureView } from "@/features/profiles/view";
import type { SectionDraftState } from "@/features/profiles/workspace/state";
import { messages } from "@/i18n";

import { RichTextView } from "./rich-text-view";

const t = messages.profiles;

type Source = "draft" | "approved";

/** The whole profile as a reader sees it: visible sections in order, draft or approved text. */
export function ProfilePreview({
  name,
  sections,
  drafts,
}: {
  name: string;
  sections: readonly SectionStructureView[];
  drafts: Readonly<Record<string, SectionDraftState>>;
}) {
  const [source, setSource] = useState<Source>("draft");
  const visible = sections.filter((section) => !section.isHidden);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">{t.preview.title}</h2>
        <SegmentedControl<Source>
          ariaLabel={t.preview.source}
          value={source}
          onValueChange={(next) => next && setSource(next)}
          options={[
            { value: "draft", label: t.version.draft },
            { value: "approved", label: t.version.approved },
          ]}
        />
      </div>

      <FadeIn key={source}>
        <article
          className="mx-auto max-w-3xl space-y-10 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 md:p-10"
          data-testid="profile-preview"
        >
          <h1 className="font-heading text-3xl font-semibold tracking-tight break-words md:text-4xl">
            {name}
          </h1>
          {visible.length === 0 && <p className="text-muted-foreground">{t.preview.nothing}</p>}
          {visible.map((section) => {
            const draft = drafts[section.id];
            const content = source === "draft" ? draft?.content : draft?.approved?.content;
            return (
              <section key={section.id} className="space-y-3">
                <h2 className="border-b pb-2 font-heading text-2xl font-semibold tracking-tight">
                  {sectionLabel(section)}
                </h2>
                {content && !isDocumentEmpty(content) ? (
                  <RichTextView content={content} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {source === "draft" ? t.preview.emptySection : t.preview.notApproved}
                  </p>
                )}
              </section>
            );
          })}
        </article>
      </FadeIn>
    </div>
  );
}

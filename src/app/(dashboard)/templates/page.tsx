import { NotebookTabs } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { messages } from "@/i18n";

const t = messages.templates;

export const metadata: Metadata = { title: t.title };

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <EmptyState icon={NotebookTabs} title={t.placeholderTitle} description={t.placeholderBody} />
    </div>
  );
}

"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

/** Error state for pages in the shell (e.g. PostgreSQL unavailable). Details stay in server logs. */
export default function DashboardError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title={messages.common.errorTitle}
      description={messages.common.errorBody}
      action={
        <Button variant="outline" onClick={() => retry()}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          {messages.common.retry}
        </Button>
      }
    />
  );
}

"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

/** Opens the browser's print dialog (where "Save as PDF" lives). */
export function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button type="button" disabled={disabled} onClick={() => window.print()}>
      <Printer data-icon="inline-start" aria-hidden />
      {messages.profiles.print.printButton}
    </Button>
  );
}

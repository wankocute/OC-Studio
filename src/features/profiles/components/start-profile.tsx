"use client";

import { FilePlus2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startProfileAction } from "@/features/profiles/actions";
import { messages } from "@/i18n";

const t = messages.profiles.start;

/** Creating the profile is an explicit action: opening the page never writes anything. */
export function StartProfileButton({ characterId }: { characterId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await startProfileAction(characterId);
            if (!result.ok) toast.error(result.error.message);
          } catch {
            toast.error(messages.profiles.status.offline);
          }
        })
      }
    >
      <FilePlus2 data-icon="inline-start" aria-hidden />
      {pending ? t.pending : t.action}
    </Button>
  );
}

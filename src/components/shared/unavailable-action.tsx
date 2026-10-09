import type { LucideIcon } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

type UnavailableActionProps = {
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "secondary";
};

/**
 * A disabled button for a feature that is planned but not implemented yet.
 * It is visibly marked "coming soon" and explains why it is disabled to assistive tech,
 * so no control in the UI pretends to work.
 */
export function UnavailableAction({
  label,
  icon: Icon,
  variant = "default",
}: UnavailableActionProps) {
  const hintId = useId();
  return (
    <div className="inline-flex items-center gap-2">
      <Button variant={variant} disabled aria-describedby={hintId}>
        {Icon && <Icon data-icon="inline-start" aria-hidden />}
        {label}
      </Button>
      <Badge variant="outline" className="text-muted-foreground">
        {messages.common.comingSoon}
      </Badge>
      <span id={hintId} className="sr-only">
        {messages.common.notAvailableYet}
      </span>
    </div>
  );
}

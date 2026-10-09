import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

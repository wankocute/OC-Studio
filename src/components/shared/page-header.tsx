import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground md:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

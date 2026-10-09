import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "error" | "pending" | "neutral";

const toneDotClass: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-destructive",
  pending: "bg-muted-foreground/50 animate-pulse",
  neutral: "bg-muted-foreground/50",
};

type StatusRowProps = {
  label: string;
  value: string;
  tone?: StatusTone;
  detail?: string;
};

export function StatusRow({ label, value, tone = "neutral", detail }: StatusRowProps) {
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 sm:text-right">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", toneDotClass[tone])} />
          {value}
        </span>
        {detail && <p className="mt-0.5 text-xs break-words text-muted-foreground">{detail}</p>}
      </dd>
    </div>
  );
}

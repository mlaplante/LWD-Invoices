import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The stat tile: Poppins 700 number over a Roboto Mono caption in
 * uppercase with 1.5px tracking. No icon chip, no coloured tile — tone
 * is carried by the number alone, so a row of tiles stays quiet until
 * something is actually wrong.
 */
export type StatTone = "default" | "primary" | "danger" | "success" | "warning";

const toneClass: Record<StatTone, string> = {
  default: "text-foreground",
  primary: "text-primary dark:text-accent-foreground",
  danger: "text-danger-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
};

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  hint?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div
        className={cn(
          "truncate text-2xl font-bold leading-none",
          toneClass[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
        {label}
      </div>
      {hint ? (
        <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </>
  );

  const shell = cn(
    "rounded-[10px] border border-border bg-card px-[22px] py-[18px]",
    href &&
      "block transition-all duration-200 ease-[ease] hover:-translate-y-0.5 hover:border-[#d1d5db] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:hover:border-[#475569]",
    className,
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

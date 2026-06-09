/**
 * Shared formatting utilities used across dashboard, portal, and pay pages.
 */

/**
 * Format a date as a short locale string (e.g. "Jan 15, 2026").
 * Accepts Date objects, ISO strings, null, or undefined.
 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date with the full month name (e.g. "January 15, 2026").
 */
export function formatDateLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a date with time (e.g. "Jan 15, 2026, 3:45 PM").
 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

/**
 * Format a recurrence frequency + interval (e.g. "Monthly", "Every 2 weeks").
 */
export function formatFrequency(freq: string, interval: number): string {
  if (interval === 1) return FREQUENCY_LABELS[freq] ?? freq;
  return `Every ${interval} ${freq.toLowerCase().replace(/ly$/, "")}s`;
}

/**
 * Format a monetary amount with currency symbol respecting position.
 * Handles Prisma Decimal objects, numbers, and numeric strings.
 */
export function formatCurrency(
  n: number | string | { toNumber(): number },
  symbol: string,
  symbolPosition: string,
): string {
  const num =
    typeof n === "object" && n !== null && "toNumber" in n
      ? n.toNumber()
      : Number(n);
  const formatted = num.toFixed(2);
  return symbolPosition === "before"
    ? `${symbol}${formatted}`
    : `${formatted}${symbol}`;
}

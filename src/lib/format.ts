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

// Fraction digits per ISO currency code (JPY → 0, BHD → 3, USD → 2, …),
// resolved through Intl and memoized. Unknown/invalid codes fall back to 2.
const currencyDecimalsCache = new Map<string, number>();

function currencyDecimals(code: string | undefined): number {
  if (!code) return 2;
  const cached = currencyDecimalsCache.get(code);
  if (cached !== undefined) return cached;

  let decimals = 2;
  try {
    decimals =
      new Intl.NumberFormat("en-US", { style: "currency", currency: code })
        .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // Unknown code — keep the 2-decimal default
  }
  currencyDecimalsCache.set(code, decimals);
  return decimals;
}

/**
 * Format a monetary amount with the org-configured currency symbol and
 * position. Uses Intl for the numeric part, so amounts get thousands
 * separators and — when the ISO `code` is provided — the currency's real
 * fraction digits (JPY → "¥1,235", BHD → "BD1,234.568").
 * Handles Prisma Decimal objects, numbers, and numeric strings.
 */
export function formatCurrency(
  n: number | string | { toNumber(): number },
  symbol: string,
  symbolPosition: string,
  code?: string,
): string {
  const num =
    typeof n === "object" && n !== null && "toNumber" in n
      ? n.toNumber()
      : Number(n);
  const decimals = currencyDecimals(code);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
  return symbolPosition === "before"
    ? `${symbol}${formatted}`
    : `${formatted}${symbol}`;
}

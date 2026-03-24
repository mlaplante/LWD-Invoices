export function formatAmount(
  amount: number | string | { toNumber(): number },
  symbol: string,
  symbolPosition: string
): string {
  const num =
    typeof amount === "object" && "toNumber" in amount
      ? amount.toNumber()
      : Number(amount);
  const formatted = num.toFixed(2);
  return symbolPosition === "before" ? `${symbol}${formatted}` : `${formatted}${symbol}`;
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

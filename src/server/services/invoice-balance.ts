import type { InvoiceStatus } from "@/generated/prisma";

const EPSILON = 0.005;

export function resolvePaymentStatus(args: {
  total: number;
  paymentsSum: number;
  creditApplied: number;
}): Extract<InvoiceStatus, "PAID" | "PARTIALLY_PAID"> {
  const balance = args.total - args.paymentsSum - args.creditApplied;
  return balance <= EPSILON ? "PAID" : "PARTIALLY_PAID";
}

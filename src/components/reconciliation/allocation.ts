export function prefillAllocation(invoiceBalance: number, unallocated: number): number {
  return Math.max(0, Math.min(invoiceBalance, unallocated));
}

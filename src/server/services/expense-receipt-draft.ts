import type { PrismaClient } from "@/generated/prisma";
import { parseReceiptWithOCR, type OCRResult } from "./receipt-ocr";

export type ReceiptFileInput = {
  file: Buffer;
  mimeType: string;
  fileName?: string;
  projectId?: string;
};

export type ExpenseReceiptDraft = {
  projectId?: string;
  name: string;
  description?: string;
  qty: number;
  rate: number;
  // The receipt date is the transaction date — a scanned receipt is an
  // already-paid purchase, so it maps to paidAt, not dueDate (which would
  // render every scanned expense instantly past-due).
  paidAt?: string;
  categoryId?: string;
  supplierId?: string;
  ocrRawResult: Record<string, unknown>;
  ocrConfidence: number;
};

export type ExpenseReceiptDraftResult = {
  draft: ExpenseReceiptDraft;
  extracted: Pick<OCRResult, "vendor" | "amount" | "tax" | "currency" | "date" | "category" | "confidence" | "lineItems">;
  warnings: string[];
};

type Category = { id: string; name: string };

const LOW_CONFIDENCE_THRESHOLD = 0.6;

const CATEGORY_KEYWORDS: Array<{ canonical: string; keywords: string[] }> = [
  { canonical: "Meals", keywords: ["meal", "food", "restaurant", "cafe", "coffee", "lunch", "dinner", "breakfast"] },
  { canonical: "Travel", keywords: ["travel", "flight", "airline", "hotel", "uber", "lyft", "taxi", "train", "parking", "mileage"] },
  { canonical: "Software", keywords: ["software", "saas", "subscription", "hosting", "domain", "github", "notion", "slack", "adobe", "google workspace"] },
  { canonical: "Office Supplies", keywords: ["office", "supply", "paper", "printer", "ink", "pen", "staples", "stationery"] },
  { canonical: "Equipment", keywords: ["equipment", "computer", "laptop", "monitor", "keyboard", "hardware", "camera"] },
  { canonical: "Utilities", keywords: ["utility", "utilities", "internet", "phone", "electric", "gas", "water"] },
  { canonical: "Services", keywords: ["service", "consulting", "contractor", "professional", "legal", "accounting"] },
];

export async function buildExpenseDraftFromReceipt(
  db: Pick<PrismaClient, "expenseCategory" | "expenseSupplier" | "expense">,
  orgId: string,
  input: ReceiptFileInput,
): Promise<ExpenseReceiptDraftResult> {
  const extracted = await parseReceiptWithOCR(input.file, input.mimeType, { fileName: input.fileName });
  const categories = await db.expenseCategory.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
  });

  const categoryId = selectCategoryId(categories, extracted);
  const supplier = extracted.vendor
    ? await db.expenseSupplier.findFirst({
        where: { organizationId: orgId, name: { equals: extracted.vendor, mode: "insensitive" } },
        select: { id: true },
      })
    : null;

  const warnings = buildWarnings(extracted);
  const lineSummary = extracted.lineItems
    .slice(0, 5)
    .map((item) => `${item.description} (${item.quantity} × ${item.unitPrice} = ${item.total})`)
    .join("; ");
  const details = [
    extracted.currency ? `Currency: ${extracted.currency}` : null,
    typeof extracted.tax === "number" ? `Tax: ${extracted.tax}` : null,
    lineSummary ? `Lines: ${lineSummary}` : null,
  ].filter(Boolean);

  return {
    draft: {
      projectId: input.projectId,
      name: extracted.vendor?.trim() || "Receipt expense",
      description: details.length ? details.join("\n") : undefined,
      qty: 1,
      rate: typeof extracted.amount === "number" ? extracted.amount : 0,
      paidAt: isIsoDate(extracted.date) ? extracted.date : undefined,
      categoryId,
      supplierId: supplier?.id,
      ocrRawResult: extracted.rawResponse,
      ocrConfidence: extracted.confidence,
    },
    extracted: {
      vendor: extracted.vendor,
      amount: extracted.amount,
      tax: extracted.tax,
      currency: extracted.currency,
      date: extracted.date,
      category: extracted.category,
      confidence: extracted.confidence,
      lineItems: extracted.lineItems,
    },
    warnings,
  };
}

export function selectCategoryId(categories: Category[], extracted: Pick<OCRResult, "vendor" | "category" | "lineItems">): string | undefined {
  if (categories.length === 0) return undefined;

  const exact = findCategoryByName(categories, extracted.category);
  if (exact) return exact.id;

  const haystack = normalizeText([
    extracted.category,
    extracted.vendor,
    ...extracted.lineItems.map((item) => item.description),
  ].filter(Boolean).join(" "));

  for (const mapping of CATEGORY_KEYWORDS) {
    const existing = findCategoryByName(categories, mapping.canonical);
    if (!existing) continue;
    if (mapping.keywords.some((keyword) => haystack.includes(normalizeText(keyword)))) {
      return existing.id;
    }
  }

  return findCategoryByName(categories, "Other")?.id
    ?? findCategoryByName(categories, "Miscellaneous")?.id
    ?? findCategoryByName(categories, "Uncategorized")?.id;
}

function buildWarnings(extracted: OCRResult): string[] {
  const warnings: string[] = [];
  if (extracted.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push("Receipt scan confidence is low; review every field before saving.");
  }
  if (!extracted.vendor) {
    warnings.push("Vendor could not be read; review the expense name before saving.");
  }
  if (typeof extracted.amount !== "number") {
    warnings.push("Total amount could not be read; enter the amount before saving.");
  }
  if (!extracted.date) {
    warnings.push("Receipt date could not be read; add the date if needed.");
  } else if (!isIsoDate(extracted.date)) {
    warnings.push("Receipt date was not in YYYY-MM-DD format; add the date manually if needed.");
  }
  if (!extracted.currency) {
    warnings.push("Currency could not be read; confirm the amount currency before saving.");
  }
  return warnings;
}

function findCategoryByName(categories: Category[], name: string | null | undefined): Category | undefined {
  if (!name) return undefined;
  const normalized = normalizeText(name);
  return categories.find((category) => normalizeText(category.name) === normalized);
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isIsoDate(date: string | null): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

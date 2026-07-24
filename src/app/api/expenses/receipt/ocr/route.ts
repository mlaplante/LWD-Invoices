import { getAuthenticatedOrg, isAuthError } from "@/lib/api-auth";
import { db } from "@/server/db";
import { parseReceiptWithOCR } from "@/server/services/receipt-ocr";
import { createRateLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { readValidatedFile, SAFE_IMAGE_MIME_TYPES } from "@/lib/file-validation";
import type { UserRole } from "@/generated/prisma";

// OCR runs an LLM per receipt — cap per-org usage so a misbehaving client or
// compromised session can't run up the bill.
const ocrLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

// Mirrors the requireRole("OWNER", "ADMIN", "ACCOUNTANT") gate on the
// equivalent expenses.scanReceipt tRPC mutation — this REST route triggers
// the same paid OCR call and must not be reachable by lower-privileged
// roles (e.g. VIEWER) just because org membership checks pass.
const SCAN_RECEIPT_ROLES: UserRole[] = ["OWNER", "ADMIN", "ACCOUNTANT"];

const ALLOWED_MIME_TYPES = SAFE_IMAGE_MIME_TYPES;
const ALLOWED_MIME_TYPE_SET = new Set<string>(ALLOWED_MIME_TYPES);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedOrg();
    if (isAuthError(auth)) return auth;
    const { orgId, user } = auth;

    // Same supabaseId -> User -> UserOrganization lookup getAuthenticatedOrg()
    // performs internally, extended to fetch the caller's role for this org
    // so we can enforce the ACCOUNTANT+ gate before any spend happens.
    const dbUser = await db.user.findFirst({
      where: { supabaseId: user.id },
      select: { id: true },
    });
    const membership = dbUser
      ? await db.userOrganization.findUnique({
          where: {
            userId_organizationId: { userId: dbUser.id, organizationId: orgId },
          },
          select: { role: true },
        })
      : null;

    if (!membership || !SCAN_RECEIPT_ROLES.includes(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    if (ocrLimiter.isLimited(orgId)) {
      return NextResponse.json(
        { error: "Too many OCR requests. Please try again in a few minutes." },
        { status: 429 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file)
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );

    if (!ALLOWED_MIME_TYPE_SET.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Supported: ${ALLOWED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 },
      );
    }

    const validated = await readValidatedFile(file, ALLOWED_MIME_TYPES);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const buffer = Buffer.from(validated.arrayBuffer);
    const ocr = await parseReceiptWithOCR(buffer, file.type);

    // Try to match vendor to existing supplier
    let supplierId: string | null = null;
    if (ocr.vendor) {
      const supplier = await db.expenseSupplier.findFirst({
        where: {
          organizationId: orgId,
          name: { contains: ocr.vendor, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (supplier) supplierId = supplier.id;
    }

    // Try to match category
    let categoryId: string | null = null;
    if (ocr.category) {
      const category = await db.expenseCategory.findFirst({
        where: {
          organizationId: orgId,
          name: { contains: ocr.category, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (category) categoryId = category.id;
    }

    return NextResponse.json({
      ocr,
      matches: { supplierId, categoryId },
    });
  } catch (err) {
    console.error("[receipt OCR]", err);
    const message = err instanceof Error ? err.message : "OCR failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

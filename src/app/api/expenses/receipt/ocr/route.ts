import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { parseReceiptWithOCR } from "@/server/services/receipt-ocr";
import { NextResponse } from "next/server";

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const orgId = user?.app_metadata?.organizationId as string | undefined;
    if (!orgId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file)
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
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

    const buffer = Buffer.from(await file.arrayBuffer());
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

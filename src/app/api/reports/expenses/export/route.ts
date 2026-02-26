import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const categoryId = searchParams.get("categoryId") ?? undefined;

  const fromRaw = fromParam ? new Date(fromParam) : undefined;
  const toRaw   = toParam   ? new Date(toParam)   : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to   = toRaw   && !isNaN(toRaw.getTime())   ? toRaw   : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const expenses = await db.expense.findMany({
    where: {
      organizationId: orgId,
      ...(categoryId ? { categoryId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      tax: { select: { name: true, rate: true } },
      project: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Name",
    "Amount",
    "Qty",
    "Total",
    "Category",
    "Supplier",
    "Tax",
    "Project",
    "Date Paid",
    "Due Date",
    "Reimbursable",
    "Payment Details",
    "Description",
    "Receipt",
  ];

  const rows = expenses.map((e) => {
    const total = (e.qty * e.rate.toNumber()).toFixed(2);
    return [
      csvEscape(e.name),
      e.rate.toNumber().toFixed(2),
      String(e.qty),
      total,
      csvEscape(e.category?.name),
      csvEscape(e.supplier?.name),
      e.tax ? csvEscape(`${e.tax.name} (${e.tax.rate}%)`) : "",
      csvEscape(e.project?.name),
      e.paidAt ? e.paidAt.toISOString().split("T")[0] : "",
      e.dueDate ? e.dueDate.toISOString().split("T")[0] : "",
      e.reimbursable ? "Yes" : "No",
      csvEscape(e.paymentDetails),
      csvEscape(e.description),
      csvEscape(e.receiptUrl),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${date}.csv"`,
    },
  });
}

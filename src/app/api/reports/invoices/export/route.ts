import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  let s = String(val);
  // Prevent formula injection before quoting so it isn't bypassed by commas
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const orgId = user?.app_metadata?.organizationId as string | undefined;
  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const invoices = await db.invoice.findMany({
    where: { organizationId: orgId, isArchived: false },
    include: {
      client: { select: { name: true } },
      currency: { select: { symbol: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { date: "desc" },
  });

  const headers = [
    "Number",
    "Type",
    "Status",
    "Client",
    "Date",
    "Due Date",
    "Subtotal",
    "Tax",
    "Total",
    "Paid",
    "Balance",
  ];
  const rows = invoices.map((inv) => {
    const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Number(inv.total) - paid;
    return [
      inv.number,
      inv.type,
      inv.status,
      inv.client.name,
      inv.date.toISOString().slice(0, 10),
      inv.dueDate?.toISOString().slice(0, 10) ?? "",
      Number(inv.subtotal).toFixed(2),
      Number(inv.taxTotal).toFixed(2),
      Number(inv.total).toFixed(2),
      paid.toFixed(2),
      balance.toFixed(2),
    ]
      .map(escapeCsv)
      .join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invoices-${date}.csv"`,
    },
  });
}

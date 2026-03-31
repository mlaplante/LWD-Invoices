import { createClient } from "@/lib/supabase/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { InvoiceStatus } from "@/generated/prisma";

function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (/^[=+\-@]/.test(str)) return `'${str}`;
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
  const basis = searchParams.get("basis") === "cash" ? "cash" : "accrual";

  const fromRaw = fromParam ? new Date(fromParam) : undefined;
  const toRaw = toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? toRaw : undefined;
  if (to) to.setHours(23, 59, 59, 999);

  const headers = [
    "Invoice Number",
    "Client",
    "Invoice Date",
    "Invoice Total",
    "Tax Name",
    "Tax Rate (%)",
    "Tax Amount",
    "Payment Status",
    "Payment Date",
    "Basis",
  ];

  let rows: string[];

  if (basis === "accrual") {
    const lineTaxes = await db.invoiceLineTax.findMany({
      where: {
        invoiceLine: {
          invoice: {
            organizationId: orgId,
            isArchived: false,
            status: { notIn: [InvoiceStatus.DRAFT] },
            ...(from || to
              ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
              : {}),
          },
        },
      },
      include: {
        tax: true,
        invoiceLine: {
          include: {
            invoice: {
              include: {
                client: { select: { name: true } },
                payments: { select: { amount: true, paidAt: true } },
              },
            },
          },
        },
      },
    });

    rows = lineTaxes.map((lt) => {
      const inv = lt.invoiceLine.invoice;
      const lastPayment = inv.payments.length > 0
        ? inv.payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime())[0].paidAt
        : null;
      return [
        csvEscape(inv.number),
        csvEscape(inv.client.name),
        inv.date.toISOString().split("T")[0],
        Number(inv.total).toFixed(2),
        csvEscape(lt.tax.name),
        Number(lt.tax.rate).toFixed(4),
        Number(lt.taxAmount).toFixed(2),
        inv.status,
        lastPayment ? lastPayment.toISOString().split("T")[0] : "",
        "Accrual",
      ].join(",");
    });
  } else {
    const payments = await db.payment.findMany({
      where: {
        organizationId: orgId,
        ...(from || to
          ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: {
        invoice: {
          include: {
            client: { select: { name: true } },
            lines: { include: { taxes: { include: { tax: true } } } },
          },
        },
      },
    });

    rows = [];
    for (const payment of payments) {
      const inv = payment.invoice;
      const invoiceTotal = Number(inv.total);
      if (invoiceTotal === 0) continue;
      const paymentRatio = Number(payment.amount) / invoiceTotal;

      for (const line of inv.lines) {
        for (const lt of line.taxes) {
          const proratedTax = Number(lt.taxAmount) * paymentRatio;
          rows.push(
            [
              csvEscape(inv.number),
              csvEscape(inv.client.name),
              inv.date.toISOString().split("T")[0],
              invoiceTotal.toFixed(2),
              csvEscape(lt.tax.name),
              Number(lt.tax.rate).toFixed(4),
              proratedTax.toFixed(2),
              inv.status,
              payment.paidAt.toISOString().split("T")[0],
              "Cash",
            ].join(",")
          );
        }
      }
    }
  }

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tax-liability-${date}.csv"`,
    },
  });
}

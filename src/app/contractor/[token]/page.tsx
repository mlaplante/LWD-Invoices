import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { getPortalBranding } from "@/lib/portal-branding";
import { PortalShell } from "@/components/portal/PortalShell";
import { formatDateLong } from "@/lib/format";
import { NEC_1099_THRESHOLD } from "@/server/services/contractor-1099";
import { ContractorPortalActions } from "@/components/contractor-portal/ContractorPortalActions";

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const W9_LABELS: Record<string, string> = {
  NOT_REQUESTED: "Not requested",
  REQUESTED: "Requested",
  RECEIVED: "On file",
};

export default async function ContractorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contractor = await db.contractor.findUnique({
    where: { portalToken: token },
    include: {
      organization: {
        select: {
          name: true,
          logoUrl: true,
          brandColor: true,
          portalTagline: true,
          portalFooterText: true,
          brandFont: true,
          hidePoweredBy: true,
        },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          method: true,
          memo: true,
          reference: true,
          reportable: true,
        },
      },
    },
  });

  if (!contractor || !contractor.portalEnabled || contractor.isArchived) {
    notFound();
  }

  const branding = getPortalBranding(contractor.organization);

  // Per-year reportable totals → 1099-NEC eligibility.
  const byYear = new Map<number, { total: number; count: number }>();
  for (const p of contractor.payments) {
    if (!p.reportable) continue;
    const year = p.paidAt.getUTCFullYear();
    const entry = byYear.get(year) ?? { total: 0, count: 0 };
    entry.total += Number(p.amount);
    entry.count++;
    byYear.set(year, entry);
  }
  const years = Array.from(byYear.entries())
    .map(([year, v]) => {
      const meetsThreshold = v.total >= NEC_1099_THRESHOLD;
      return {
        year,
        total: v.total,
        meetsThreshold,
        eligible: meetsThreshold && !contractor.exemptFrom1099,
      };
    })
    .sort((a, b) => b.year - a.year);

  const displayName = contractor.businessName || contractor.legalName;

  return (
    <PortalShell branding={branding}>
      <div className="space-y-6">
        {/* Identity */}
        <section className="rounded-2xl border bg-card p-5" style={{ borderColor: `${branding.brandColor}20` }}>
          <h2 className="text-lg font-semibold">{displayName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Contractor portal · {contractor.organization.name}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">W-9 status</dt>
              <dd className="font-medium">{W9_LABELS[contractor.w9Status] ?? contractor.w9Status}</dd>
            </div>
            {contractor.tinLast4 && (
              <div>
                <dt className="text-muted-foreground text-xs">Tax ID</dt>
                <dd className="font-medium">•••• {contractor.tinLast4}</dd>
              </div>
            )}
            {contractor.email && (
              <div>
                <dt className="text-muted-foreground text-xs">Email</dt>
                <dd className="font-medium truncate">{contractor.email}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* W-9 + 1099 actions (client) */}
        <ContractorPortalActions
          token={token}
          w9OnFile={contractor.w9Status === "RECEIVED"}
          eligibleYears={years.filter((y) => y.eligible).map((y) => y.year)}
        />

        {/* Tax years */}
        {years.length > 0 && (
          <section className="rounded-2xl border bg-card overflow-hidden" style={{ borderColor: `${branding.brandColor}20` }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: `${branding.brandColor}20` }}>
              <p className="text-sm font-semibold">Tax years</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                  <th className="px-5 py-2">Year</th>
                  <th className="px-5 py-2 text-right">Reportable paid</th>
                  <th className="px-5 py-2">1099-NEC</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} className="border-t" style={{ borderColor: `${branding.brandColor}15` }}>
                    <td className="px-5 py-3 font-medium">{y.year}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{usd(y.total)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {y.eligible ? "Will be issued" : contractor.exemptFrom1099 ? "Exempt" : "Below $600"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Payment history */}
        <section className="rounded-2xl border bg-card overflow-hidden" style={{ borderColor: `${branding.brandColor}20` }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: `${branding.brandColor}20` }}>
            <p className="text-sm font-semibold">Payment history</p>
          </div>
          {contractor.payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2">Method</th>
                  <th className="px-5 py-2">Memo</th>
                  <th className="px-5 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {contractor.payments.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: `${branding.brandColor}15` }}>
                    <td className="px-5 py-3">{formatDateLong(p.paidAt)}</td>
                    <td className="px-5 py-3">{p.method}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.memo || p.reference || "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{usd(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PortalShell>
  );
}

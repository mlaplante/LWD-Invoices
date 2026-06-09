import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Profitability-insights section of the Money Intelligence hub.
 *
 * Placeholder shell — the cash-margin insights (median comparison, break-even
 * notes) and the link to the existing /reports/profitability table land in
 * T7 (#5). The existing profitability report is left untouched.
 */
export function ProfitabilitySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profitability insights</CardTitle>
        <CardDescription>
          Cash-margin highlights across clients and projects — which clients sit below your median
          margin, and where a project&apos;s break-even sits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}

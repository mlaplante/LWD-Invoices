import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Runway / burn section of the Money Intelligence hub.
 *
 * Placeholder shell — the burn-rate + net-position derivation and trajectory
 * chart land in T6 (#1). Kept as its own component so that task only has to
 * fill in the body.
 */
export function RunwaySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runway &amp; burn</CardTitle>
        <CardDescription>
          Monthly burn and projected net cash position over the next 30/60/90 days, from your
          recurring revenue, recurring expenses, and contractor outflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}

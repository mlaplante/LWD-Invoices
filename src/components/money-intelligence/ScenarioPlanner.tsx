import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Scenario planner section of the Money Intelligence hub.
 *
 * Placeholder shell — the interactive what-if inputs (late payment, contractor
 * hire, revenue churn) and baseline-vs-scenario trajectories land in T5 (#6),
 * built on the existing cash-flow forecast engine.
 */
export function ScenarioPlanner() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario planner</CardTitle>
        <CardDescription>
          Model what-ifs against your cash-flow forecast: a client paying late, hiring a
          contractor, or recurring revenue churning — and see the impact on your runway.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </CardContent>
    </Card>
  );
}

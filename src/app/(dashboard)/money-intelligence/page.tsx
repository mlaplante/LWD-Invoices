import { api, HydrateClient } from "@/trpc/server";
import { RunwaySection } from "@/components/money-intelligence/RunwaySection";
import { ForecastAccuracySection } from "@/components/money-intelligence/ForecastAccuracySection";
import { ScenarioPlanner } from "@/components/money-intelligence/ScenarioPlanner";
import { ProfitabilitySection } from "@/components/money-intelligence/ProfitabilitySection";
import { ExpenseBudgetsSection } from "@/components/money-intelligence/ExpenseBudgetsSection";

export const metadata = { title: "Money Intelligence" };

export default function MoneyIntelligencePage() {
  // Kick off every section's query on the server so the data streams down with
  // the page instead of waterfalling client-side (download JS → hydrate →
  // fetch). Fire-and-forget: the sections' useQuery calls pick these up from
  // the hydrated cache.
  void api.analytics.runway.prefetch();
  void api.analytics.forecastAccuracy.prefetch();
  void api.analytics.expenseBudgetVsActual.prefetch();
  void api.analytics.cashFlowForecast.prefetch(undefined);
  void api.analytics.profitabilityInsights.prefetch();
  void api.expenseBudgets.list.prefetch();
  void api.expenseCategories.list.prefetch();

  return (
    <HydrateClient>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Money Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Forward-looking cash-flow tools: your runway and burn, expense budgets vs. actuals,
            what-if scenario planning, and profitability insights. Per-invoice signals — payment
            probability, send-timing, and duplicate warnings — appear directly on your invoices.
          </p>
        </div>
        <RunwaySection />
        <ForecastAccuracySection />
        <ExpenseBudgetsSection />
        <ScenarioPlanner />
        <ProfitabilitySection />
      </div>
    </HydrateClient>
  );
}

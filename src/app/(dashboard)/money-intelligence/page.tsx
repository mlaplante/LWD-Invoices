import { RunwaySection } from "@/components/money-intelligence/RunwaySection";
import { ScenarioPlanner } from "@/components/money-intelligence/ScenarioPlanner";
import { ProfitabilitySection } from "@/components/money-intelligence/ProfitabilitySection";

export const metadata = { title: "Money Intelligence" };

export default function MoneyIntelligencePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Money Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Forward-looking cash-flow tools: your runway and burn, what-if scenario planning, and
          profitability insights. Per-invoice signals — payment probability, send-timing, and
          duplicate warnings — appear directly on your invoices.
        </p>
      </div>
      <RunwaySection />
      <ScenarioPlanner />
      <ProfitabilitySection />
    </div>
  );
}

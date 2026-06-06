import { DisputesList } from "@/components/disputes/DisputesList";

export const metadata = { title: "Disputes" };

export default function DisputesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Disputes</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Chargebacks raised against your Stripe payments. Respond with evidence before the deadline
          or concede — the status tracks Stripe as the bank decides.
        </p>
      </div>
      <DisputesList />
    </div>
  );
}

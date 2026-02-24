import { GatewaySettingsForm } from "@/components/settings/GatewaySettingsForm";

export default function PaymentsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure payment gateways your clients can use to pay invoices online.
        </p>
      </div>
      <GatewaySettingsForm />
    </div>
  );
}

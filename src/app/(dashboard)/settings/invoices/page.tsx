import { api } from "@/trpc/server";
import { InvoiceTemplateSettings } from "@/components/settings/InvoiceTemplateSettings";

export default async function InvoiceSettingsPage() {
  const org = await api.organization.get();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Invoice Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose your invoice PDF layout and customize its appearance.
          </p>
        </div>
      </div>

      <InvoiceTemplateSettings org={org} />
    </div>
  );
}

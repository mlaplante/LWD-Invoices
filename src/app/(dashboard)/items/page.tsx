import { api } from "@/trpc/server";
import { ItemManager } from "@/components/items/ItemManager";

export default async function ItemsPage() {
  const items = await api.items.list();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable line items you can quickly add to invoices.
          </p>
        </div>
      </div>

      {/* Item manager card */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Library
          </p>
          <p className="text-base font-semibold mt-0.5">Saved Items</p>
        </div>
        <div className="p-4">
          <ItemManager initialItems={items} />
        </div>
      </div>
    </div>
  );
}

import { api } from "@/trpc/server";
import { ItemManager } from "@/components/items/ItemManager";

export default async function ItemsPage() {
  const items = await api.items.list();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reusable line items you can quickly add to invoices.
        </p>
      </div>
      <ItemManager initialItems={items} />
    </div>
  );
}

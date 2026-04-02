"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Category = { id: string; name: string };

export function ExpenseCategoryFilter({
  categories,
  selected,
}: {
  categories: Category[];
  selected?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(categoryId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (categoryId) params.set("categoryId", categoryId);
    else params.delete("categoryId");
    router.replace(`/reports/expenses?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1.5 print:hidden">
      <label htmlFor="filter-category" className="text-xs text-muted-foreground font-medium">Category</label>
      <select
        id="filter-category"
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

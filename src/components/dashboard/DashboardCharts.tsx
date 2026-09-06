"use client";

// This wrapper exists because next/dynamic only defers a chunk when the
// dynamic() call itself runs in a Client Component. page.tsx (the dashboard
// route) is a Server Component, so calling dynamic() there still bundles the
// ~400KB Recharts chunk into the route's server-rendered entry JS — the
// import is resolved at build/render time on the server, not deferred to the
// client. Moving the dynamic() calls into this "use client" module makes
// Next.js treat them as genuine client-side lazy imports, so the chart chunk
// is only fetched after hydration.
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const RevenueChart = dynamic(
  () => import("@/components/dashboard/RevenueChart").then((m) => m.RevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-[10px]" /> },
);

export const InvoiceStatusChart = dynamic(
  () => import("@/components/dashboard/InvoiceStatusChart").then((m) => m.InvoiceStatusChart),
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-[10px]" /> },
);

export const ExpensesVsRevenueChart = dynamic(
  () => import("@/components/dashboard/ExpensesVsRevenueChart").then((m) => m.ExpensesVsRevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-72 rounded-[10px]" /> },
);

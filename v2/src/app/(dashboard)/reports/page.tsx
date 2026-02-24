import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const reports = [
  {
    href: "/reports/unpaid",
    title: "Unpaid Invoices",
    description: "Outstanding invoices requiring payment",
  },
  {
    href: "/reports/payments",
    title: "Payments by Gateway",
    description: "Revenue breakdown by payment method",
  },
  {
    href: "/reports/expenses",
    title: "Expense Breakdown",
    description: "Project expenses by category and supplier",
  },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reports.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-base">{r.title}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

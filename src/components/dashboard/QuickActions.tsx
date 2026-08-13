import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Header actions. The design moves these out of the page body and up
 * beside the greeting as outlined buttons — New Invoice already lives in
 * the rail, so it isn't repeated here.
 */
const actions = [
  { label: "New client", href: "/clients/new" },
  { label: "Log expense", href: "/expenses/new" },
  { label: "Start timer", href: "/timesheets" },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2.5">
      {actions.map(({ label, href }) => (
        <Button key={href} asChild variant="outline">
          <Link href={href}>{label}</Link>
        </Button>
      ))}
    </div>
  );
}

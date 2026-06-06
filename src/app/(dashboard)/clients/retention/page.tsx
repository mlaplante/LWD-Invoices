import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { RetentionQueue } from "@/components/retention/RetentionQueue";

export default function ClientRetentionPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Clients
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Client Retention</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Past clients you&apos;re due to reach out to. The system surfaces the
              reminder; you write the message.
            </p>
          </div>
          <Link
            href="/settings/retention"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </div>
      </div>
      <RetentionQueue />
    </div>
  );
}

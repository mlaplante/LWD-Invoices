import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RetentionSettings } from "@/components/retention/RetentionSettings";

export default function RetentionSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Client Retention</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          A weekly queue of relationship touches with past clients. The system
          surfaces who's due; you write the message. Visible only to admins.
        </p>
      </div>
      <RetentionSettings />
    </div>
  );
}

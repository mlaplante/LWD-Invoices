import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WeeklyBriefingSettings } from "@/components/settings/WeeklyBriefingSettings";

export default function BriefingSettingsPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Weekly Briefing</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          A proactive Monday email composing your overdue total, at-risk clients, and projected
          cash position from the analytics you already track. Push, don&apos;t pull.
        </p>
      </div>
      <WeeklyBriefingSettings />
    </div>
  );
}

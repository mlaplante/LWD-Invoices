"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScheduledReportList } from "@/components/settings/ScheduledReportList";
import { ScheduledReportForm } from "@/components/settings/ScheduledReportForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ScheduledReportsSettingsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function handleEdit(id: string) {
    setEditId(id);
    setShowForm(true);
  }

  function handleClose() {
    setShowForm(false);
    setEditId(null);
  }

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Scheduled Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically generate and email reports on a recurring schedule.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Schedule
            </Button>
          )}
        </div>
      </div>

      {showForm && <ScheduledReportForm editId={editId} onClose={handleClose} />}
      <ScheduledReportList onEdit={handleEdit} />
    </div>
  );
}

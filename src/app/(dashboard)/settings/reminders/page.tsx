"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReminderSequenceList } from "@/components/settings/ReminderSequenceList";
import { ReminderSequenceForm } from "@/components/settings/ReminderSequenceForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RemindersSettingsPage() {
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
            <h1 className="text-2xl font-bold tracking-tight">Reminder Sequences</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure automatic reminder emails sent at specific intervals relative to invoice due dates.
              Uses template variables: {"{{ clientName }}"}, {"{{ invoiceNumber }}"}, {"{{ amountDue }}"}, {"{{ dueDate }}"}, {"{{ paymentLink }}"}, {"{{ orgName }}"}.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Sequence
            </Button>
          )}
        </div>
      </div>

      {showForm && <ReminderSequenceForm editId={editId} onClose={handleClose} />}
      <ReminderSequenceList onEdit={handleEdit} />
    </div>
  );
}

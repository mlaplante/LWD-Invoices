"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AutomationList } from "@/components/settings/AutomationList";
import { AutomationForm } from "@/components/settings/AutomationForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AutomationsSettingsPage() {
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
      {/* Header */}
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
            <h1 className="text-2xl font-bold tracking-tight">
              Email Automations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Automatically send emails when invoices are sent, viewed, paid, or
              overdue.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Automation
            </Button>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && <AutomationForm editId={editId} onClose={handleClose} />}

      {/* List */}
      <AutomationList onEdit={handleEdit} />
    </div>
  );
}

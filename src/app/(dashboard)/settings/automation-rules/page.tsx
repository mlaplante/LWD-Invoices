"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AutomationRuleList } from "@/components/settings/AutomationRuleList";
import { AutomationRuleForm } from "@/components/settings/AutomationRuleForm";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AutomationRulesSettingsPage() {
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
            <h1 className="text-2xl font-bold tracking-tight">Automation Rules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build your own rules: pick a trigger, add conditions, and choose what happens.
              Generalizes email automations and reminder sequences into one no-code engine.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              New Rule
            </Button>
          )}
        </div>
      </div>

      {showForm && <AutomationRuleForm editId={editId} onClose={handleClose} />}

      <AutomationRuleList onEdit={handleEdit} />
    </div>
  );
}

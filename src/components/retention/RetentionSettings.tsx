"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  TOUCH_TYPE_LABELS,
  TOUCH_TYPE_DESCRIPTIONS,
} from "@/server/services/check-in-templates";
import { toast } from "sonner";
import { format } from "date-fns";
import { RotateCcw, Save } from "lucide-react";
import type { ClientCheckInTouchType } from "@/generated/prisma";

const VARIABLES = [
  { key: "client_first_name", help: "Best guess at the client's first name" },
  { key: "client_name", help: "Full client name as stored" },
  { key: "client_company", help: "Same as client name for now" },
  { key: "project_name", help: "Project name (project-anchored touches only)" },
  { key: "sender_name", help: "Your name — leave as placeholder for now" },
];

export function RetentionSettings() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.checkInTemplates.getSettings.useQuery();
  const { data: templates = [] } = trpc.checkInTemplates.list.useQuery();

  const setEnabled = trpc.checkInTemplates.setEnabled.useMutation({
    onSuccess: () => {
      utils.checkInTemplates.getSettings.invalidate();
      toast.success("Updated");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Enable retention automation</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Weekly cron surfaces due check-ins into the{" "}
              <a href="/clients/retention" className="text-primary hover:underline">
                retention queue
              </a>
              . You'll get a notification on Mondays when there's something to review.
            </p>
            {settings?.retentionEnabledAt && (
              <p className="text-xs text-muted-foreground mt-2">
                First enabled{" "}
                {format(new Date(settings.retentionEnabledAt), "MMM d, yyyy")} — only
                projects completed after this date generate check-ins.
              </p>
            )}
          </div>
          <Switch
            checked={settings?.retentionEnabled ?? false}
            disabled={isLoading || setEnabled.isPending}
            onCheckedChange={(v) => setEnabled.mutate({ enabled: v })}
          />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-1">Message Templates</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Scaffolds that prefill the draft in the queue. You edit the actual
          message each time — these are starting points, not finished copy.
        </p>
        <div className="space-y-4">
          {templates.map((t) => (
            <TemplateEditor key={t.touchType} template={t} />
          ))}
        </div>
      </div>

      <details className="rounded-2xl border border-border/50 bg-card px-6 py-4">
        <summary className="text-sm font-semibold cursor-pointer">
          Variables
        </summary>
        <ul className="mt-3 space-y-1.5">
          {VARIABLES.map((v) => (
            <li key={v.key} className="flex items-baseline gap-3 text-sm">
              <code className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">{`{{ ${v.key} }}`}</code>
              <span className="text-muted-foreground">{v.help}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type TemplateData = {
  touchType: ClientCheckInTouchType;
  id: string | null;
  subject: string;
  body: string;
  isCustom: boolean;
};

function TemplateEditor({ template }: { template: TemplateData }) {
  const utils = trpc.useUtils();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body);
    setDirty(false);
  }, [template.subject, template.body]);

  const save = trpc.checkInTemplates.upsert.useMutation({
    onSuccess: () => {
      utils.checkInTemplates.list.invalidate();
      toast.success("Template saved");
      setDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const reset = trpc.checkInTemplates.resetToDefault.useMutation({
    onSuccess: () => {
      utils.checkInTemplates.list.invalidate();
      toast.success("Reset to default");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">{TOUCH_TYPE_LABELS[template.touchType]}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {TOUCH_TYPE_DESCRIPTIONS[template.touchType]}
          </p>
        </div>
        {template.isCustom && (
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded bg-emerald-50 text-emerald-700 px-2 py-0.5">
            Customized
          </span>
        )}
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Subject</label>
          <Input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Body</label>
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            rows={10}
            className="font-mono text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              save.mutate({
                touchType: template.touchType,
                subject,
                body,
              })
            }
            disabled={!dirty || save.isPending}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Save
          </Button>
          {template.isCustom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reset.mutate({ touchType: template.touchType })}
              disabled={reset.isPending}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset to default
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

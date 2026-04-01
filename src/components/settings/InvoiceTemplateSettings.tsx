"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type Props = {
  org: {
    brandColor: string | null;
    logoUrl: string | null;
    invoiceTemplate: string;
    invoiceFontFamily: string | null;
    invoiceAccentColor: string | null;
    invoiceShowLogo: boolean;
    invoiceFooterText: string | null;
    defaultDepositPercent: number | null;
  };
};

const TEMPLATES = [
  {
    id: "modern",
    name: "Modern",
    description: "Clean and contemporary with rounded elements and color accents.",
    preview: (color: string) => (
      <div className="w-full h-full p-3 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div className="w-8 h-2 rounded bg-muted-foreground/30" />
          <div className="w-12 h-4 rounded" style={{ backgroundColor: color }} />
        </div>
        <div className="h-px bg-border/50 my-1" />
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
            <div className="w-16 h-1.5 rounded bg-muted-foreground/30" />
          </div>
          <div className="space-y-1 text-right">
            <div className="w-10 h-1.5 rounded bg-muted-foreground/20 ml-auto" />
            <div className="w-14 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
          </div>
        </div>
        <div className="rounded bg-muted/50 p-1.5 space-y-1 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="w-16 h-1 rounded bg-muted-foreground/20" />
              <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-14 h-2 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.8 }} />
        </div>
      </div>
    ),
  },
  {
    id: "classic",
    name: "Classic",
    description: "Traditional and formal with ruled lines and structured layout.",
    preview: (color: string) => (
      <div className="w-full h-full p-3 flex flex-col gap-2">
        <div className="flex justify-between items-end pb-1.5 border-b-2 border-foreground/20">
          <div className="w-16 h-2.5 rounded" style={{ backgroundColor: color, opacity: 0.7 }} />
          <div className="space-y-0.5 text-right">
            <div className="w-12 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
            <div className="w-8 h-1 rounded bg-muted-foreground/20 ml-auto" />
          </div>
        </div>
        <div className="flex gap-4 my-1">
          <div className="space-y-1">
            <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            <div className="w-14 h-1.5 rounded bg-muted-foreground/30" />
          </div>
          <div className="space-y-1 ml-auto text-right">
            <div className="w-8 h-1 rounded bg-muted-foreground/20 ml-auto" />
            <div className="w-12 h-1.5 rounded bg-muted-foreground/30 ml-auto" />
          </div>
        </div>
        <div className="border-t border-b border-foreground/20 py-1 space-y-1 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between border-b border-border/30 pb-0.5">
              <div className="w-16 h-1 rounded bg-muted-foreground/20" />
              <div className="w-8 h-1 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
        <div className="text-right border-t-2 border-foreground/20 pt-1">
          <div className="w-12 h-2 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.6 }} />
        </div>
      </div>
    ),
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Sparse and clean with generous whitespace and subtle details.",
    preview: (color: string) => (
      <div className="w-full h-full p-4 flex flex-col gap-3">
        <div>
          <div className="w-10 h-1.5 rounded bg-muted-foreground/30" />
          <div className="w-6 h-1 rounded bg-muted-foreground/15 mt-2" />
          <div className="w-14 h-2.5 rounded bg-muted-foreground/30 mt-0.5" />
        </div>
        <div className="border-b border-dotted border-border" />
        <div className="space-y-2 flex-1">
          {[1, 2].map((i) => (
            <div key={i} className="flex justify-between border-b border-dotted border-border/50 pb-1.5">
              <div className="space-y-0.5">
                <div className="w-14 h-1 rounded bg-muted-foreground/25" />
                <div className="w-8 h-0.5 rounded bg-muted-foreground/15" />
              </div>
              <div className="w-8 h-1 rounded bg-muted-foreground/25" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-6 h-0.5 rounded bg-muted-foreground/15 ml-auto" />
          <div className="w-16 h-3 rounded ml-auto mt-0.5" style={{ backgroundColor: color, opacity: 0.7 }} />
        </div>
      </div>
    ),
  },
  {
    id: "compact",
    name: "Compact",
    description: "Dense layout with more data per page, great for detailed invoices.",
    preview: (color: string) => (
      <div className="w-full h-full p-2 flex flex-col gap-1.5">
        <div className="rounded px-2 py-1.5 flex justify-between items-center" style={{ backgroundColor: color }}>
          <div className="w-10 h-1.5 rounded bg-white/70" />
          <div className="w-6 h-1 rounded bg-white/50" />
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 rounded bg-muted/50 p-1 space-y-0.5">
              <div className="w-6 h-0.5 rounded bg-muted-foreground/20" />
              <div className="w-10 h-1 rounded bg-muted-foreground/30" />
            </div>
          ))}
        </div>
        <div className="border border-border/50 rounded flex-1">
          <div className="bg-muted/30 px-1.5 py-0.5 flex gap-1">
            {["w-8", "w-4", "w-4", "w-4", "w-4"].map((w, i) => (
              <div key={i} className={`${w} h-0.5 rounded bg-muted-foreground/25`} />
            ))}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-1.5 py-0.5 border-b border-border/30 flex gap-1">
              <div className="w-8 h-0.5 rounded bg-muted-foreground/15" />
              <div className="w-4 h-0.5 rounded bg-muted-foreground/15 ml-auto" />
            </div>
          ))}
        </div>
        <div className="text-right">
          <div className="w-10 h-1.5 rounded ml-auto" style={{ backgroundColor: color, opacity: 0.7 }} />
        </div>
      </div>
    ),
  },
] as const;

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica (Sans-serif)" },
  { value: "georgia", label: "Georgia (Serif)" },
  { value: "courier", label: "Courier (Monospace)" },
];

export function InvoiceTemplateSettings({ org }: Props) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Invoice template settings saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const [template, setTemplate] = useState(org.invoiceTemplate);
  const [fontFamily, setFontFamily] = useState(org.invoiceFontFamily ?? "helvetica");
  const [accentColor, setAccentColor] = useState(org.invoiceAccentColor ?? org.brandColor ?? "#2563eb");
  const [showLogo, setShowLogo] = useState(org.invoiceShowLogo);
  const [footerText, setFooterText] = useState(org.invoiceFooterText ?? "");
  const [depositPercent, setDepositPercent] = useState<number | null>(org.defaultDepositPercent);

  function handleSave() {
    updateMutation.mutate({
      invoiceTemplate: template as "modern" | "classic" | "minimal" | "compact",
      invoiceFontFamily: fontFamily as "helvetica" | "georgia" | "courier",
      invoiceAccentColor: accentColor || null,
      invoiceShowLogo: showLogo,
      invoiceFooterText: footerText || null,
      defaultDepositPercent: depositPercent,
    });
  }

  return (
    <div className="space-y-6">
      {/* Template Picker */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Layout
          </p>
          <p className="text-base font-semibold mt-1">Invoice Template</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose a layout for your PDF invoices.
          </p>
        </div>
        <div className="px-6 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "relative rounded-xl border-2 p-0 overflow-hidden transition-all text-left",
                  template === t.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border/50 hover:border-border"
                )}
              >
                {/* Visual preview */}
                <div className="aspect-[8.5/11] bg-white relative">
                  {t.preview(accentColor)}
                  {template === t.id && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="px-3 py-2.5 border-t border-border/50">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {t.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customization */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Customization
          </p>
          <p className="text-base font-semibold mt-1">Template Options</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Fine-tune the appearance of your invoices.
          </p>
        </div>
        <div className="px-6 py-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Font */}
            <div className="space-y-1.5">
              <Label htmlFor="invoiceFont">Font Family</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger id="invoiceFont">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Accent Color */}
            <div className="space-y-1.5">
              <Label>Invoice Accent Color</Label>
              <p className="text-xs text-muted-foreground">
                Falls back to your brand color if not set.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border p-0.5"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#2563eb"
                  className="w-32 font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          {/* Show Logo */}
          <div className="flex items-center gap-3">
            <Switch
              id="invoiceShowLogo"
              checked={showLogo}
              onCheckedChange={setShowLogo}
            />
            <Label htmlFor="invoiceShowLogo" className="cursor-pointer">
              Show organization logo on invoices
            </Label>
          </div>

          {/* Footer Text */}
          <div className="space-y-1.5">
            <Label htmlFor="invoiceFooterText">Invoice Footer Text</Label>
            <Textarea
              id="invoiceFooterText"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="e.g. Payment terms: Net 30. Thank you for your business."
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
      </div>

      {/* Deposit Default */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-6 py-5 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Payments
          </p>
          <p className="text-base font-semibold mt-1">Default Deposit</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            When set, new invoices will default to requiring a deposit.
          </p>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="deposit-toggle">Require deposit by default</Label>
            <Switch
              id="deposit-toggle"
              checked={depositPercent !== null}
              onCheckedChange={(checked) => setDepositPercent(checked ? 50 : null)}
            />
          </div>
          {depositPercent !== null && (
            <div className="space-y-1">
              <Label htmlFor="deposit-percent">Deposit percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="deposit-percent"
                  type="number"
                  min={1}
                  max={99}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value) || 50)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save + Preview */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Template Settings"}
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/invoices/preview-pdf" target="_blank">
            Preview PDF
          </a>
        </Button>
      </div>
    </div>
  );
}

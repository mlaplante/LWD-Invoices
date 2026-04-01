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

type Props = {
  org: {
    name: string;
    logoUrl: string | null;
    brandColor: string | null;
    portalTagline: string | null;
    portalFooterText: string | null;
    brandFont: string | null;
    hidePoweredBy: boolean;
  };
};

const FONT_OPTIONS = [
  { value: "inter", label: "Inter (Sans-serif)" },
  { value: "georgia", label: "Georgia (Serif)" },
  { value: "system", label: "System Default" },
] as const;

const FONT_FAMILIES: Record<string, string> = {
  inter: "'Inter', sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export function PortalBrandingForm({ org }: Props) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => {
      void utils.organization.get.invalidate();
      toast.success("Portal branding saved");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const [tagline, setTagline] = useState(org.portalTagline ?? "");
  const [footerText, setFooterText] = useState(org.portalFooterText ?? "");
  const [font, setFont] = useState(org.brandFont ?? "inter");
  const [hidePowered, setHidePowered] = useState(org.hidePoweredBy);

  function handleSave() {
    updateMutation.mutate({
      portalTagline: tagline || null,
      portalFooterText: footerText || null,
      brandFont: font as "inter" | "georgia" | "system",
      hidePoweredBy: hidePowered,
    });
  }

  const brandColor = org.brandColor ?? "#2563eb";
  const previewFont = FONT_FAMILIES[font] ?? FONT_FAMILIES.inter;

  return (
    <div className="space-y-6">
      {/* Form fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="portalTagline">Portal Tagline</Label>
          <Input
            id="portalTagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Professional invoicing made simple"
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            Shown below your organization name in the portal header.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brandFont">Portal Font</Label>
          <Select value={font} onValueChange={setFont}>
            <SelectTrigger id="brandFont">
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="portalFooterText">Footer Text</Label>
        <Textarea
          id="portalFooterText"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          placeholder="e.g. Thank you for your business!"
          rows={2}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          Custom text displayed in the portal footer.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="hidePoweredBy"
          checked={hidePowered}
          onCheckedChange={setHidePowered}
        />
        <Label htmlFor="hidePoweredBy" className="cursor-pointer">
          Hide &quot;Powered by LWD Invoices&quot; badge
        </Label>
      </div>

      {/* Live Preview */}
      <div className="space-y-1.5">
        <Label>Preview</Label>
        <div
          className="rounded-xl border border-border/50 overflow-hidden text-sm"
          style={{ fontFamily: previewFont }}
        >
          {/* Preview header */}
          <div
            className="px-4 py-3 text-center border-b"
            style={{ borderColor: `${brandColor}20` }}
          >
            {org.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.logoUrl}
                alt={org.name}
                className="mx-auto mb-2 h-8 w-auto max-w-[120px] object-contain"
              />
            )}
            <p className="font-bold text-foreground">{org.name}</p>
            {tagline && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {tagline}
              </p>
            )}
          </div>

          {/* Preview body */}
          <div className="px-4 py-6 bg-muted/30 text-center text-muted-foreground text-xs">
            Invoice content preview area
          </div>

          {/* Preview footer */}
          <div className="px-4 py-2.5 text-center text-xs text-muted-foreground border-t border-border/50">
            {footerText && <p>{footerText}</p>}
            {!hidePowered && (
              <p className="opacity-60">Powered by LWD Invoices</p>
            )}
          </div>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? "Saving..." : "Save Portal Branding"}
      </Button>
    </div>
  );
}

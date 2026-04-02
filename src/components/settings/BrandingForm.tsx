"use client";

import { useState, useRef } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  org: {
    logoUrl: string | null;
    brandColor: string | null;
  };
};

export function BrandingForm({ org }: Props) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: () => void utils.organization.get.invalidate(),
  });

  const [color, setColor] = useState(org.brandColor ?? "#2563eb");
  const [logoUrl, setLogoUrl] = useState<string | null>(org.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/logo", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setLogoUrl(json.url!);
      void utils.organization.get.invalidate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleRemoveLogo() {
    updateMutation.mutate({ logoUrl: null });
    setLogoUrl(null);
  }

  function handleColorSave() {
    updateMutation.mutate({ brandColor: color });
  }

  return (
    <div className="rounded-lg border p-6 space-y-6">
      {/* Brand color */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Brand Color</label>
        <p className="text-sm text-muted-foreground">Used as the accent color on invoices and the client portal.</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded border p-0.5"
          />
          <Input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#2563eb"
            className="w-32 font-mono"
            maxLength={7}
          />
          <Button
            size="sm"
            onClick={handleColorSave}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving…" : "Save Color"}
          </Button>
        </div>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Logo</label>
        <p className="text-sm text-muted-foreground">PNG, JPG, WebP or SVG. Max 2 MB. Shown on invoices and the client portal.</p>

        {logoUrl ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Organization logo"
              className="h-16 w-auto max-w-[160px] rounded border object-contain p-1"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo} disabled={updateMutation.isPending}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload Logo"}
          </Button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleLogoUpload}
        />

        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      </div>
    </div>
  );
}

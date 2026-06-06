"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, CheckCircle2 } from "lucide-react";

interface Props {
  token: string;
  w9OnFile: boolean;
  eligibleYears: number[];
}

export function ContractorPortalActions({ token, w9OnFile, eligibleYears }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/contractor-portal/${token}/w9`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Upload failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4" style={{ borderColor: "var(--portal-brand, #2563eb)20" }}>
      <div>
        <p className="text-sm font-semibold">Documents</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Submit your W-9 and download any 1099-NEC forms you&apos;re eligible for.
        </p>
      </div>

      {/* W-9 */}
      <div className="flex flex-wrap items-center gap-3">
        {w9OnFile ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <CheckCircle2 className="w-4 h-4" /> W-9 on file
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No W-9 on file yet.</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 hover:bg-accent/40 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Uploading…" : w9OnFile ? "Replace W-9" : "Submit W-9"}
        </button>
      </div>

      {/* 1099 downloads */}
      {eligibleYears.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {eligibleYears.map((year) => (
            <a
              key={year}
              href={`/api/contractor-portal/${token}/1099?year=${year}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium border rounded-lg px-3 py-1.5 hover:bg-accent/40"
            >
              <Download className="w-3.5 h-3.5" />
              {year} 1099-NEC
            </a>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

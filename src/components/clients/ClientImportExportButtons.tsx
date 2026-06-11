"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";

/**
 * Export downloads the org's clients as CSV (existing exports.clientsCSV
 * procedure); import accepts the same column layout back, parsed server-side.
 */
export function ClientImportExportButtons() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: { line: number; message: string }[];
  } | null>(null);

  const importMutation = trpc.clients.importCsv.useMutation({
    onSuccess: (summary) => {
      setResult(summary);
      if (summary.created > 0) {
        toast.success(`Imported ${summary.created} client${summary.created === 1 ? "" : "s"}`);
        router.refresh();
      } else {
        toast.info("No new clients imported");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleExport() {
    try {
      const { csv, truncated, cap } = await utils.exports.clientsCSV.fetch();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) toast.warning(`Export capped at ${cap} rows`);
    } catch {
      toast.error("Export failed");
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error("File is too large (max 1 MB)");
      return;
    }
    file.text().then((text) => {
      setFileName(file.name);
      setCsvText(text);
      setResult(null);
    });
  }

  function closeImport() {
    setImportOpen(false);
    setFileName(null);
    setCsvText(null);
    setResult(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="w-4 h-4 mr-1.5" />
        Export
      </Button>
      <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="w-4 h-4 mr-1.5" />
        Import
      </Button>

      <Dialog open={importOpen} onOpenChange={(open) => (open ? setImportOpen(true) : closeImport())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import clients from CSV</DialogTitle>
            <DialogDescription>
              First row must be a header. Supported columns: name (required), email, phone,
              address, city, state, zip, country, tax id, notes, tags, payment terms. Separate
              multiple tags with “;”. Rows matching an existing client are skipped.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            {fileName ? `Selected: ${fileName}` : "Click to choose a .csv file"}
          </button>

          {result && (
            <div className="rounded-lg bg-accent/50 p-3 text-sm space-y-1">
              <p>
                <span className="font-medium">{result.created}</span> created,{" "}
                <span className="font-medium">{result.skipped}</span> skipped as duplicates.
              </p>
              {result.errors.length > 0 && (
                <ul className="text-xs text-destructive list-disc pl-4 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      Line {err.line}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeImport}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button
                onClick={() => csvText && importMutation.mutate({ csv: csvText })}
                disabled={!csvText || importMutation.isPending}
              >
                {importMutation.isPending ? "Importing…" : "Import"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

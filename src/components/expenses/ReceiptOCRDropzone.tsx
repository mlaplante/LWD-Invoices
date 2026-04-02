"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { OCRResult } from "@/server/services/receipt-ocr";

interface Props {
  onResult: (data: {
    ocr: OCRResult;
    matches: { supplierId: string | null; categoryId: string | null };
    receiptUrl: string;
  }) => void;
}

type ScanState = "idle" | "uploading" | "scanning" | "done" | "error";

function confidenceBadge(confidence: number) {
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        {Math.round(confidence * 100)}% confidence
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="w-3 h-3" />
        {Math.round(confidence * 100)}% confidence
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertTriangle className="w-3 h-3" />
      {Math.round(confidence * 100)}% confidence
    </span>
  );
}

export function ReceiptOCRDropzone({ onResult }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setConfidence(null);

      // Upload receipt first
      setState("uploading");
      const uploadBody = new FormData();
      uploadBody.append("file", file);

      let receiptUrl: string;
      try {
        const uploadRes = await fetch("/api/expenses/receipt", {
          method: "POST",
          body: uploadBody,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok)
          throw new Error(uploadData.error ?? "Upload failed");
        receiptUrl = uploadData.url;
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Upload failed");
        return;
      }

      // OCR the receipt
      setState("scanning");
      const ocrBody = new FormData();
      ocrBody.append("file", file);

      try {
        const ocrRes = await fetch("/api/expenses/receipt/ocr", {
          method: "POST",
          body: ocrBody,
        });
        const ocrData = await ocrRes.json();
        if (!ocrRes.ok) throw new Error(ocrData.error ?? "OCR failed");

        setConfidence(ocrData.ocr.confidence);
        setState("done");
        onResult({
          ocr: ocrData.ocr,
          matches: ocrData.matches,
          receiptUrl,
        });
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "OCR failed");
      }
    },
    [onResult],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors
          ${dragOver ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50 hover:bg-accent/20"}
          ${state === "error" ? "border-destructive/50 bg-destructive/5" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleChange}
          className="hidden"
        />

        {state === "idle" && (
          <>
            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop a receipt to scan</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              or click to browse — PNG, JPEG, WebP, GIF
            </p>
          </>
        )}

        {state === "uploading" && (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
            <p className="text-sm font-medium">Uploading receipt...</p>
          </>
        )}

        {state === "scanning" && (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-2" />
            <p className="text-sm font-medium">Scanning receipt with AI...</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This may take a few seconds
            </p>
          </>
        )}

        {state === "done" && confidence !== null && (
          <>
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
            <p className="text-sm font-medium">Receipt scanned</p>
            <div className="mt-1">{confidenceBadge(confidence)}</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setState("idle");
                setConfidence(null);
              }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Scan another receipt
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="w-8 h-8 text-destructive mb-2" />
            <p className="text-sm font-medium text-destructive">
              {error ?? "Something went wrong"}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setState("idle");
                setError(null);
              }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

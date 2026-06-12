"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import type { ScanInvoiceDraftRequest, ScanInvoiceDraftResponse, InvoiceQaFinding } from "@/server/services/invoice-draft-qa";

type InvoiceDraftQAProps = {
  mode: "create" | "edit";
  draft: ScanInvoiceDraftRequest["draft"];
  calculatedTotals: ScanInvoiceDraftRequest["calculatedTotals"];
  invoiceId?: string;
  clientId?: string;
  currencyId?: string;
  clientName?: string;
  currencyCode?: string;
};

type ScanState = "idle" | "loading" | "clean" | "findings" | "partial" | "error";

interface InvoiceDraftQAState {
  scanId: string;
  status: ScanInvoiceDraftResponse["status"];
  findings: InvoiceQaFinding[];
  scannedAt: string;
  summary: {
    highestSeverity: string | null;
    findingCount: number;
    directlyApplicableFixCount: number;
    modelUsed?: string;
    deterministicOnly: boolean;
  };
  guardrails: {
    groundedOnly: boolean;
    tenantScoped: boolean;
    autoAppliedChanges: boolean;
    aiUnavailable?: boolean;
    droppedUngroundedFindingCount?: number;
  };
}

// ─── Types for UI ─────────────────────────────────────────────────────────

type ReviewState = "pending" | "applied" | "dismissed" | "kept";

// ─── Component ────────────────────────────────────────────────────────────

export function InvoiceDraftQA({
  mode,
  draft,
  calculatedTotals,
  invoiceId,
  clientId,
  currencyId,
  clientName,
  currencyCode,
}: InvoiceDraftQAProps) {
  const scanMutation = trpc.invoiceReview.scanDraft.useMutation();
  
  // State
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanResult, setScanResult] = useState<InvoiceDraftQAState | null>(null);
  const [reviewState, setReviewState] = useState<Record<string, ReviewState>>({});
  
  // Scan the draft
  const handleScan = async () => {
    if (scanState === "loading") return;
    
    setScanState("loading");
    
    const input: ScanInvoiceDraftRequest = {
      mode,
      invoiceId: mode === "edit" ? invoiceId : undefined,
      draft,
      calculatedTotals,
      clientContext: clientId && currencyId ? {
        clientName,
        currencyCode,
      } : undefined,
    };
    
    try {
      const result = await scanMutation.mutateAsync(input);
      
      // Transform response to UI state
      setScanResult({
        scanId: result.scanId,
        status: result.status,
        findings: result.findings,
        scannedAt: result.scannedAt,
        summary: result.summary,
        guardrails: result.guardrails,
      });
      
      // Set scan state based on results
      if (result.status === "partial" && result.guardrails.aiUnavailable) {
        setScanState("partial");
      } else if (result.findings.length === 0) {
        setScanState("clean");
      } else {
        setScanState("findings");
      }
    } catch {
      setScanState("error");
    }
  };
  
  // Mark a finding for review
  const handleReviewState = (findingId: string, state: ReviewState) => {
    setReviewState((prev) => ({
      ...prev,
      [findingId]: state,
    }));
  };
  
  // Apply a fix to the draft
  const handleApplyFix = (findingId: string, patch: InvoiceQaFinding["suggestedFix"]) => {
    if (!patch?.patch) return;
    
    // Patches are preview-only until a parent draft updater is wired in.
    handleReviewState(findingId, "applied");
  };

  const renderFindings = (findings: InvoiceQaFinding[]) => {
    const groupedBySeverity = findings.reduce<Record<string, InvoiceQaFinding[]>>((acc, f) => {
      if (!acc[f.severity]) acc[f.severity] = [];
      acc[f.severity].push(f);
      return acc;
    }, {});
    
    const severityOrder: string[] = ["critical", "warning", "info"];
    
    return (
      <div className="space-y-2">
        {severityOrder.map((severity) => {
          const group = groupedBySeverity[severity];
          if (!group) return null;
          
          return (
            <div key={severity} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  severity === "critical" ? "bg-red-500" :
                  severity === "warning" ? "bg-yellow-500" : "bg-blue-500"
                }`} />
                <span className="text-xs font-medium uppercase text-muted-foreground">{severity}</span>
                <span className="text-xs text-muted-foreground">({group.length})</span>
              </div>
              {group.map((finding) => {
                const state = reviewState[finding.id];
                return (
                  <div
                    key={finding.id}
                    className="rounded-lg border bg-background p-3 text-sm"
                    role="region"
                    aria-labelledby={`finding-${finding.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <h3 id={`finding-${finding.id}`} className="font-medium">
                          {finding.title}
                        </h3>
                        <p className="text-muted-foreground">{finding.message}</p>
                        {finding.evidence.explanation && (
                          <p className="text-xs text-muted-foreground">
                            {finding.evidence.explanation}
                          </p>
                        )}
                        {state && (
                          <p className="text-xs font-medium text-muted-foreground">
                            Marked {state.replace("-", " ")}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        {Math.round(finding.confidence * 100)}%
                      </div>
                    </div>
                    
                    {finding.suggestedFix && (
                      <div className="mt-2 space-y-2">
                        <div className="rounded-md bg-muted p-2">
                          <p className="font-medium">{finding.suggestedFix.label}</p>
                          <p className="text-muted-foreground">{finding.suggestedFix.description}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleApplyFix(finding.id, finding.suggestedFix)}
                        >
                          Preview fix
                        </Button>
                      </div>
                    )}
                    
                    <div className="mt-2 flex flex-wrap gap-2">
                      {finding.suggestedFix?.patch && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleApplyFix(finding.id, finding.suggestedFix)}
                        >
                          Apply to draft
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleReviewState(finding.id, "dismissed")}
                      >
                        Dismiss
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleReviewState(finding.id, "kept")}
                      >
                        Keep as-is
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };
  
  // Render based on scan state
  if (scanState === "idle") {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Invoice Draft QA</h2>
          <p className="text-sm text-muted-foreground">
            Scan this draft for missing info, duplicate risk, unclear lines, and possible revenue leakage.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleScan}
          className="h-8"
        >
          Scan draft
        </Button>
      </div>
    );
  }
  
  if (scanState === "loading") {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Reviewing draft…</p>
        </div>
      </div>
    );
  }
  
  if (scanState === "clean") {
    return (
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <p className="text-sm text-muted-foreground">No issues found in this scan.</p>
        </div>
        {scanResult && (
          <div className="text-xs text-muted-foreground">
            Scanned at {new Date(scanResult.scannedAt).toLocaleString()}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleScan}
          className="h-6 text-xs"
        >
          Re-scan
        </Button>
      </div>
    );
  }
  
  if (scanState === "partial") {
    return (
      <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <p className="text-sm text-muted-foreground">
            Some AI checks were unavailable; deterministic checks completed.
          </p>
        </div>
        {scanResult && renderFindings(scanResult.findings)}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleScan}
          className="h-6 text-xs"
        >
          Re-scan
        </Button>
      </div>
    );
  }
  
  if (scanState === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-muted-foreground">
            QA unavailable. You can keep editing or save without it.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleScan}
          className="h-6 text-xs"
        >
          Try again
        </Button>
      </div>
    );
  }
  
  // Findings state
  if (scanState === "findings") {
    return (
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Draft Review Findings</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleScan}
            className="h-6 text-xs"
          >
            Re-scan
          </Button>
        </div>
        {scanResult && (
          <div className="text-xs text-muted-foreground">
            {scanResult.summary.findingCount} finding{scanResult.summary.findingCount !== 1 ? "s" : ""} ·{" "}
            {scanResult.summary.directlyApplicableFixCount} fix{scanResult.summary.directlyApplicableFixCount !== 1 ? "es" : ""} available
          </div>
        )}
        {scanResult && renderFindings(scanResult.findings)}
      </div>
    );
  }
  
  return null;
}

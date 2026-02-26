"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  invoiceId: string;
  token: string;
  currentStatus: string;
}

export function EstimateActions({ token, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAction(action: "accept" | "decline") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/${token}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { status: string };
        setStatus(data.status);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "ACCEPTED") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-sm font-medium">
        Estimate accepted
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm font-medium">
        Estimate declined
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={() => handleAction("accept")} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            "Accept Estimate"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => handleAction("decline")}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            "Decline"
          )}
        </Button>
      </div>
    </div>
  );
}

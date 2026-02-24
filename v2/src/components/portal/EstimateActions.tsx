"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  invoiceId: string;
  token: string;
  currentStatus: string;
}

export function EstimateActions({ token, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "accept" | "decline") {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { status: string };
        setStatus(data.status);
      }
    } finally {
      setLoading(false);
    }
  }

  if (status === "ACCEPTED") {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 p-3 text-green-700 text-sm font-medium">
        Estimate accepted
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm font-medium">
        Estimate declined
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => handleAction("accept")} disabled={loading}>
        Accept Estimate
      </Button>
      <Button
        variant="outline"
        onClick={() => handleAction("decline")}
        disabled={loading}
      >
        Decline
      </Button>
    </div>
  );
}

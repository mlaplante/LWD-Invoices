"use client";

import { Button } from "@/components/ui/button";
import { Link2, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopyPaymentLinkButton({ payLink }: { payLink: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
    toast.success("Payment link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
      ) : (
        <Link2 className="w-3.5 h-3.5 mr-1.5" />
      )}
      {copied ? "Copied" : "Pay Link"}
    </Button>
  );
}

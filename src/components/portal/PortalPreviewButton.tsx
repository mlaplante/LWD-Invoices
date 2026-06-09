"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { toast } from "sonner";

type Props = {
  /** Which portal to preview: the client dashboard or a single invoice. */
  target: "client" | "invoice";
  /** Client id or invoice id, matching `target`. */
  id: string;
  /**
   * Plain portal URL opened when the preview session can't be issued
   * (e.g. the viewer isn't an OWNER/ADMIN) — they'll hit the normal
   * passphrase gate, same as before.
   */
  fallbackUrl: string;
};

/**
 * "View as client" button for staff. Issues a short-lived, audited portal
 * session via tRPC and opens the portal in a new tab — no client passphrase
 * needed, so it keeps working after clients change theirs.
 */
export function PortalPreviewButton({ target, id, fallbackUrl }: Props) {
  const clientPreview = trpc.clients.previewPortal.useMutation();
  const invoicePreview = trpc.invoices.previewPortal.useMutation();
  const isPending = clientPreview.isPending || invoicePreview.isPending;

  function handleClick() {
    // Open the tab synchronously so popup blockers allow it, then point it
    // at the portal once the preview session cookie is set.
    const win = window.open("about:blank", "_blank");
    const navigate = (url: string) => {
      if (win) win.location.href = url;
      else window.location.href = url;
    };
    const opts = {
      onSuccess: ({ url }: { url: string }) => navigate(url),
      onError: (err: { data?: { code?: string } | null }) => {
        if (err.data?.code === "FORBIDDEN") {
          navigate(fallbackUrl);
        } else {
          win?.close();
          toast.error("Couldn't open the portal preview. Please try again.");
        }
      },
    };
    if (target === "client") clientPreview.mutate({ id }, opts);
    else invoicePreview.mutate({ id }, opts);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      title="Open the client portal as this client (no passphrase needed)"
      className="shrink-0"
    >
      <Eye className="w-3.5 h-3.5 mr-1.5" />
      View as client
    </Button>
  );
}

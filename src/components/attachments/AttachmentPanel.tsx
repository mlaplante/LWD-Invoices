"use client";

import { useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, ExternalLink } from "lucide-react";
import { AttachmentContext } from "@/generated/prisma";
import { formatBytes } from "@/lib/utils";

interface Props {
  context: AttachmentContext;
  contextId: string;
}

export function AttachmentPanel({ context, contextId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: attachments } = trpc.attachments.list.useQuery({
    context,
    contextId,
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("context", context);
      fd.append("contextId", contextId);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setUploadError(data.error ?? "Upload failed");
      } else {
        void utils.attachments.list.invalidate({ context, contextId });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      void utils.attachments.list.invalidate({ context, contextId });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Attachments</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-4 w-4 mr-1" />
          {uploading ? "Uploading..." : "Attach File"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx"
        />
      </div>
      {uploadError && (
        <p className="text-sm text-destructive">{uploadError}</p>
      )}
      <div className="space-y-2">
        {(attachments ?? []).map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 p-2 border rounded-md text-sm"
          >
            <span className="flex-1 truncate">{a.originalName}</span>
            <span className="text-muted-foreground text-xs">
              {formatBytes(a.size)}
            </span>
            <a
              href={a.storageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open attachment"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
            <button
              onClick={() => handleDelete(a.id)}
              aria-label="Delete attachment"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
        {(attachments ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No attachments</p>
        )}
      </div>
    </div>
  );
}

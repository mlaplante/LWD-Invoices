"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  invoiceId: string;
};

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InvoiceComments({ invoiceId }: Props) {
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState("");

  const { data: comments, refetch } = trpc.comments.list.useQuery({ invoiceId });

  const addComment = trpc.comments.add.useMutation({
    onSuccess: () => {
      setBody("");
      setError("");
      void refetch();
    },
    onError: (err) => setError(err.message),
  });

  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => void refetch(),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    addComment.mutate({ invoiceId, body: body.trim(), isPrivate });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Comments</h2>

      {(!comments || comments.length === 0) && (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      )}

      {comments && comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border p-4 ${c.isPrivate ? "border-yellow-200 bg-yellow-50/50" : "bg-card"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {c.authorName ?? (c.authorUserId ? "Staff" : "Client")}
                    </span>
                    {c.isPrivate && (
                      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                        Private
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                </div>
                {c.authorUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => deleteComment.mutate({ id: c.id })}
                    disabled={deleteComment.isPending}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
        <p className="text-sm font-medium">Add a note</p>

        <div className="space-y-1.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note or comment..."
            rows={3}
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isPrivate"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="isPrivate" className="text-sm font-normal cursor-pointer">
            Private (staff only, hidden from client portal)
          </Label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" size="sm" disabled={addComment.isPending}>
          {addComment.isPending ? "Adding..." : "Add Comment"}
        </Button>
      </form>
    </div>
  );
}

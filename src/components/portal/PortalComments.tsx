"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/format";

type Comment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

type Props = {
  token: string;
  initialComments: Comment[];
};

export function PortalComments({ token, initialComments }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const addComment = trpc.portal.addComment.useMutation({
    onSuccess: (newComment) => {
      setComments((prev) => [
        ...prev,
        {
          id: newComment.id,
          body: newComment.body,
          authorName: newComment.authorName ?? "Anonymous",
          createdAt: newComment.createdAt.toISOString(),
        },
      ]);
      setBody("");
      setSubmitted(true);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!authorName.trim() || !body.trim()) return;
    addComment.mutate({ token, body: body.trim(), authorName: authorName.trim() });
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      <h2 className="text-base font-semibold text-foreground mb-4">Comments</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">No comments yet.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl border border-border/50 bg-accent/30 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{c.authorName}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {submitted ? (
        <div className="flex gap-2 text-emerald-600">
          <CheckCircle2 className="w-5 h-5" />
          Your comment was submitted.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium text-foreground">Leave a comment</p>

          <div className="space-y-1.5">
            <Label htmlFor="authorName" className="text-xs">Your name</Label>
            <Input
              id="authorName"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="commentBody" className="text-xs">Message</Label>
            <Textarea
              id="commentBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={3}
              maxLength={2000}
              required
            />
          </div>

          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</div>}

          <Button
            type="submit"
            size="sm"
            disabled={addComment.isPending}
          >
            {addComment.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...</> : "Submit Comment"}
          </Button>
        </form>
      )}
    </div>
  );
}

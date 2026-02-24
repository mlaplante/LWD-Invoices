"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
    <div className="rounded-lg border bg-white shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Comments</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">No comments yet.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-gray-50 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">{c.authorName}</span>
                <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {submitted ? (
        <p className="text-sm text-green-600 font-medium">
          Your comment was submitted.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium text-gray-700">Leave a comment</p>

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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            size="sm"
            disabled={addComment.isPending}
          >
            {addComment.isPending ? "Submitting..." : "Submit Comment"}
          </Button>
        </form>
      )}
    </div>
  );
}

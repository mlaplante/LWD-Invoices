"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  projectId: string;
}

function DiscussionReplyForm({ discussionId, projectId, utils }: { discussionId: string; projectId: string; utils: ReturnType<typeof trpc.useUtils> }) {
  const [body, setBody] = useState("");
  const reply = trpc.discussions.reply.useMutation({
    onSuccess: () => {
      utils.discussions.list.invalidate({ projectId });
      setBody("");
    },
  });
  return (
    <div className="flex gap-2 mt-2">
      <Textarea
        className="text-sm"
        placeholder="Write a reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
      />
      <Button
        size="sm"
        disabled={!body.trim() || reply.isPending}
        onClick={() => reply.mutate({ discussionId, body: body.trim() })}
      >
        Reply
      </Button>
    </div>
  );
}

export function DiscussionThread({ projectId }: Props) {
  const { data: discussions } = trpc.discussions.list.useQuery({ projectId });
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.discussions.create.useMutation({
    onSuccess: () => {
      utils.discussions.list.invalidate({ projectId });
      setNewSubject("");
      setNewBody("");
    },
  });

  return (
    <div className="space-y-4">
      {(discussions ?? []).map((d) => (
        <div key={d.id} className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center gap-2 p-4 text-left hover:bg-muted/30"
            onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium flex-1">{d.subject}</span>
            <span className="text-xs text-muted-foreground">
              {d.replies.length} {d.replies.length === 1 ? "reply" : "replies"}
            </span>
            {expandedId === d.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {expandedId === d.id && (
            <div className="border-t p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
              </p>
              <p className="text-sm whitespace-pre-wrap">{d.body}</p>

              {d.replies.map((r) => (
                <div key={r.id} className="ml-4 pl-4 border-l text-sm">
                  <p className="text-xs text-muted-foreground mb-1">
                    {r.isStaff ? "Staff" : "Client"} &middot;{" "}
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                  <p>{r.body}</p>
                </div>
              ))}

              <DiscussionReplyForm discussionId={d.id} projectId={projectId} utils={utils} />
            </div>
          )}
        </div>
      ))}

      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium">Start a Discussion</h3>
        <Input
          placeholder="Subject"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
        />
        <Textarea
          placeholder="What would you like to discuss?"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={3}
        />
        <Button
          size="sm"
          disabled={!newSubject.trim() || !newBody.trim() || create.isPending}
          onClick={() => create.mutate({ projectId, subject: newSubject.trim(), body: newBody.trim() })}
        >
          Post
        </Button>
      </div>
    </div>
  );
}

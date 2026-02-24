"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import type { Ticket, TicketMessage, Client } from "@/generated/prisma";

interface Props {
  ticket: Ticket & { messages: TicketMessage[]; client: Client | null };
}

export function TicketThread({ ticket }: Props) {
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();
  const reply = trpc.tickets.reply.useMutation({
    onSuccess: () => {
      utils.tickets.get.invalidate({ id: ticket.id });
      setBody("");
    },
  });

  return (
    <div className="space-y-4">
      {ticket.messages.map((m) => (
        <div
          key={m.id}
          className={`p-4 rounded-lg border text-sm ${m.isStaff ? "bg-muted/30" : "bg-background"}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium">{m.isStaff ? "Staff" : (m.authorName ?? "Client")}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
      <div className="space-y-2">
        <Textarea
          placeholder="Write a reply..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
        />
        <Button
          onClick={() => reply.mutate({ ticketId: ticket.id, body })}
          disabled={!body.trim() || reply.isPending}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}

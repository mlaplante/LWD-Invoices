"use client";

import { trpc } from "@/trpc/client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Send, MailCheck, Eye, MousePointerClick, AlertTriangle, Ban, Mail, PenLine } from "lucide-react";

type Props = { invoiceId: string; hasSent: boolean; signedAt: Date | string | null };

// Visual config per Resend event type. Unknown types fall back to a neutral row.
const EVENT_CONFIG: Record<
  string,
  { label: string; icon: typeof Mail; className: string }
> = {
  "email.sent": { label: "Sent", icon: Send, className: "bg-gray-100 text-gray-500" },
  "email.delivered": { label: "Delivered", icon: MailCheck, className: "bg-blue-50 text-blue-600" },
  "email.delivery_delayed": { label: "Delivery delayed", icon: AlertTriangle, className: "bg-amber-50 text-amber-600" },
  "email.opened": { label: "Opened", icon: Eye, className: "bg-emerald-50 text-emerald-600" },
  "email.clicked": { label: "Clicked link", icon: MousePointerClick, className: "bg-violet-50 text-violet-600" },
  "email.bounced": { label: "Bounced", icon: Ban, className: "bg-red-50 text-red-600" },
  "email.complained": { label: "Marked as spam", icon: AlertTriangle, className: "bg-red-50 text-red-600" },
};

function configFor(type: string) {
  return (
    EVENT_CONFIG[type] ?? {
      label: type.replace(/^email\./, "").replace(/_/g, " "),
      icon: Mail,
      className: "bg-gray-100 text-gray-500",
    }
  );
}

export function ProposalEngagementPanel({ invoiceId, hasSent, signedAt }: Props) {
  const { data: events = [], isLoading } = trpc.proposals.getEngagementEvents.useQuery({ invoiceId });

  // Nothing to show and the proposal was never emailed — stay out of the way.
  if (!hasSent && events.length === 0) return null;

  const openCount = events.filter((e) => e.type === "email.opened").length;
  const clickCount = events.filter((e) => e.type === "email.clicked").length;
  const delivered = events.some((e) => e.type === "email.delivered");
  // The headline signal for proposals: the prospect opened it but hasn't signed.
  const viewedNotSigned = openCount > 0 && !signedAt;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Proposal Engagement</h2>
        {events.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            {delivered && (
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-600">
                Delivered
              </span>
            )}
            {openCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-600">
                Opened{openCount > 1 ? ` ×${openCount}` : ""}
              </span>
            )}
            {clickCount > 0 && (
              <span className="inline-flex items-center rounded-md bg-violet-50 px-2 py-0.5 font-semibold text-violet-600">
                Clicked{clickCount > 1 ? ` ×${clickCount}` : ""}
              </span>
            )}
            {signedAt ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-700">
                <PenLine className="h-3 w-3" /> Signed
              </span>
            ) : viewedNotSigned ? (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-600">
                Viewed · not signed
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border/50 p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading engagement…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tracking events yet. Delivery, open, and click events appear here once the
            recipient interacts with the proposal email.
          </p>
        ) : (
          <ol className="relative space-y-4">
            {events.map((event, i) => {
              const { label, icon: Icon, className } = configFor(event.type);
              const isLast = i === events.length - 1;
              return (
                <li key={event.id} className="relative flex gap-3 pl-1">
                  {!isLast && (
                    <span
                      className="absolute left-[15px] top-8 bottom-[-1rem] w-px bg-border/60"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      className
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.occurredAt)}
                      </span>
                    </div>
                    {event.recipient && (
                      <p className="text-xs text-muted-foreground">{event.recipient}</p>
                    )}
                    {event.link && (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-xs text-primary hover:underline"
                      >
                        {event.link}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

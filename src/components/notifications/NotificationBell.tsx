"use client";

import { trpc } from "@/trpc/client";
import { Bell, Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const SNOOZE_OPTIONS = [
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "4 hours", ms: 4 * 60 * 60_000 },
  { label: "Tomorrow", ms: 24 * 60 * 60_000 },
  { label: "Next week", ms: 7 * 24 * 60 * 60_000 },
];

export function NotificationBell() {
  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(
    undefined,
    {
      refetchInterval: (query) =>
        typeof document !== "undefined" && document.visibilityState === "hidden"
          ? false
          : 30_000,
      refetchIntervalInBackground: false,
    },
  );
  const { data: notifications = [] } = trpc.notifications.list.useQuery({
    limit: 10,
  });
  const utils = trpc.useUtils();

  const invalidate = () => {
    void utils.notifications.unreadCount.invalidate();
    void utils.notifications.list.invalidate();
  };

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: invalidate,
  });
  const snooze = trpc.notifications.snooze.useMutation({ onSuccess: invalidate });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-medium text-sm">Notifications</span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`group flex items-start justify-between gap-2 p-3 border-b text-sm ${!n.isRead ? "bg-muted/30" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label="Snooze notification"
                    disabled={snooze.isPending}
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.label}
                      onClick={() =>
                        snooze.mutate({
                          id: n.id,
                          until: new Date(Date.now() + opt.ms).toISOString(),
                        })
                      }
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No notifications
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

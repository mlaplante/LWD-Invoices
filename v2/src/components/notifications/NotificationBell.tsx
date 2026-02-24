"use client";

import { trpc } from "@/trpc/client";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const { data: count = 0 } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const { data: notifications = [] } = trpc.notifications.list.useQuery({
    limit: 10,
  });
  const utils = trpc.useUtils();

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

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
              className={`p-3 border-b text-sm ${!n.isRead ? "bg-muted/30" : ""}`}
            >
              <p className="font-medium">{n.title}</p>
              <p className="text-muted-foreground">{n.body}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(n.createdAt), {
                  addSuffix: true,
                })}
              </p>
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

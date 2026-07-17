"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

type Notification = { id: string; message: string; readAt: string | null; createdAt: string };

/** In-app notification list with an unread badge. */
export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Notification[]>("/api/notifications"),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: () => api("/api/notifications", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = notifications?.filter((n) => !n.readAt).length ?? 0;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unread > 0) markRead.mutate();
        }}
      >
        🔔
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-vt-orange px-1.5 text-xs font-bold text-white">
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          {!notifications || notifications.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No notifications.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="rounded p-2 text-sm hover:bg-accent">
                  <p>{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

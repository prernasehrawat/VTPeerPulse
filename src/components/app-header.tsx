"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AppHeader({ title, userName }: { title: string; userName: string }) {
  return (
    <header className="flex items-center justify-between border-b bg-background px-6 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold">VT PeerPulse</span>
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{userName}</span>
        <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </div>
    </header>
  );
}

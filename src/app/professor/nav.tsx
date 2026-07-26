"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/professor", label: "Overview" },
  { href: "/professor/rounds", label: "Rounds" },
  { href: "/professor/questions", label: "Questions" },
  { href: "/professor/teams", label: "Teams & Students" },
  { href: "/professor/analytics", label: "Analytics" },
  { href: "/professor/alerts", label: "Alerts" },
  { href: "/professor/summaries", label: "AI Summaries" },
  { href: "/professor/reports", label: "Reports & Settings" },
  { href: "/professor/courses", label: "Courses" },
  { href: "/professor/audit", label: "Audit log" },
];

/** The shared link list, used by both the desktop sidebar and the mobile drawer. */
function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {LINKS.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            onClick={onNavigate}
            aria-current={pathname === l.href ? "page" : undefined}
            className={cn(
              "block rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === l.href
                ? "border-vt-orange bg-accent font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Desktop-only left sidebar (hidden below lg, where the mobile drawer takes over). */
export function ProfessorNav() {
  return (
    <nav
      aria-label="Instructor navigation"
      className="hidden w-52 shrink-0 border-r bg-muted/40 p-4 lg:block"
    >
      <NavList />
    </nav>
  );
}

/** Mobile-only top bar with a hamburger that opens the nav in a left drawer. */
export function ProfessorMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const current = LINKS.find((l) => l.href === pathname)?.label ?? "Menu";

  return (
    <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 lg:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger
          className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-accent"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] overflow-y-auto border-r bg-background p-4 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
          >
            <DialogPrimitive.Title className="mb-3 px-3 text-sm font-semibold">
              Navigation
            </DialogPrimitive.Title>
            <NavList onNavigate={() => setOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <span className="text-sm font-medium">{current}</span>
    </div>
  );
}

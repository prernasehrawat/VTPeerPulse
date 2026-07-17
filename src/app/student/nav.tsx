"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/student", label: "Current evaluation" },
  { href: "/student/history", label: "My past submissions" },
  { href: "/student/feedback", label: "My feedback" },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b bg-muted/40 px-6" aria-label="Student navigation">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname === l.href ? "page" : undefined}
          className={cn(
            "border-b-2 px-3 py-2.5 text-sm transition-colors hover:text-primary",
            pathname === l.href
              ? "border-vt-orange font-semibold text-primary"
              : "border-transparent text-muted-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

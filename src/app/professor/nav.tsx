"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function ProfessorNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Instructor navigation" className="w-52 shrink-0 border-r bg-muted/40 p-4">
      <ul className="space-y-1">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
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
    </nav>
  );
}

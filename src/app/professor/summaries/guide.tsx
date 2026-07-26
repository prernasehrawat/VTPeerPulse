"use client";

import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { SUMMARY_KINDS } from "./kinds";

const STEPS: [string, string][] = [
  ["Generate", "Pick a round and a type, then create a draft."],
  ["Review & edit", "Read it over and revise the wording — you have the final say."],
  ["Release", "Send it to the student (student-shareable type only)."],
];

const OPEN_KEY = "peerpulse-summaries-guide-open";

/**
 * Full-width, collapsible explainer at the top of the Summaries page. Its
 * open/closed state persists in localStorage (lazy-init so the server and first
 * client render agree). Collapsing leaves just the header bar; the tools below
 * always use the full page width.
 */
export function SummaryGuide() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        // best-effort persistence
      }
      return next;
    });

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="summary-guide-body"
          onClick={toggle}
          className="flex w-full items-center gap-2 rounded-xl px-5 py-4 text-left text-primary transition-colors hover:bg-primary/10"
        >
          <Info className="size-5 shrink-0" />
          <span className="text-base font-semibold tracking-tight">How it works</span>
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h2>

      {/* grid-rows 1fr↔0fr gives a smooth height transition with no fixed max-height */}
      <div
        id="summary-guide-body"
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-5 px-5 pb-5">
            <p className="max-w-prose text-sm text-muted-foreground">
              PeerPulse reads the anonymous written feedback from a round and drafts a summary for
              you. Reviewer identities are never included.
            </p>

            <ol className="grid gap-3 sm:grid-cols-3">
              {STEPS.map(([step, desc], i) => (
                <li key={step} className="rounded-lg border border-primary/15 bg-background/50 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{step}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </li>
              ))}
            </ol>

            <div>
              <p className="mb-2 text-sm font-medium">The summary types</p>
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {SUMMARY_KINDS.map((k) => (
                  <li key={k.value} className="text-sm">
                    <span className="font-medium">{k.label}</span>
                    {k.shareable && (
                      <Badge variant="secondary" className="ml-1.5 align-middle text-[10px]">
                        Can be sent to students
                      </Badge>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{k.blurb}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

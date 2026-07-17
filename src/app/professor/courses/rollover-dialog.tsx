"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { COURSE_COOKIE } from "@/components/course-context";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Source = { id: string; code: string; name: string; term: string };

export function RolloverDialog({ source }: { source: Source }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(source.code);
  const [name, setName] = useState(source.name);
  const [term, setTerm] = useState("");
  const [copyRoster, setCopyRoster] = useState(true);
  const [copyTeams, setCopyTeams] = useState(true);

  const rollover = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/api/courses/${source.id}/rollover`, {
        method: "POST",
        // Teams need the roster they reference; keep the two flags consistent.
        body: JSON.stringify({ code, name, term, copyRoster: copyRoster || copyTeams, copyTeams }),
      }),
    onSuccess: (course) => {
      toast.success(`Rolled over to ${term}`);
      document.cookie = `${COURSE_COOKIE}=${encodeURIComponent(course.id)}; path=/; max-age=31536000; samesite=lax`;
      qc.invalidateQueries({ queryKey: ["courses"] });
      setOpen(false);
      setTerm("");
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Roll over
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Roll over {source.code}</DialogTitle>
          <DialogDescription>
            Creates a new term from {source.code} ({source.term}). Copies the questions and,
            optionally, the roster and teams. Rounds, submissions, and summaries always start fresh.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!term.trim()) {
              toast.error("Enter a term for the new course");
              return;
            }
            rollover.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="ro-code">Code</Label>
            <Input id="ro-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ro-name">Name</Label>
            <Input id="ro-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ro-term">New term</Label>
            <Input
              id="ro-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Spring 2027"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={copyRoster}
                disabled={copyTeams}
                onChange={(e) => setCopyRoster(e.target.checked)}
              />
              Copy roster (students &amp; staff)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={copyTeams}
                onChange={(e) => {
                  setCopyTeams(e.target.checked);
                  if (e.target.checked) setCopyRoster(true);
                }}
              />
              Copy teams (keeps the same groupings)
            </label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={rollover.isPending}>
              {rollover.isPending ? "Rolling over…" : "Create new term"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

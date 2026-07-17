"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Status = "submitted" | "started" | "pending";
type TrackedStudent = {
  id: string;
  name: string;
  email: string;
  team: { id: string; name: string } | null;
  status: Status;
  submittedAt: string | null;
  startedAt: string | null;
};
type Tracker = {
  roundStatus: "DRAFT" | "OPEN" | "CLOSED";
  students: TrackedStudent[];
  counts: { total: number; submitted: number; started: number; pending: number };
};

const STATUS_BADGE: Record<Status, "default" | "secondary" | "outline"> = {
  submitted: "default",
  started: "secondary",
  pending: "outline",
};
const STATUS_LABEL: Record<Status, string> = {
  submitted: "Submitted",
  started: "In progress",
  pending: "Not started",
};

export function SubmissionTracker({
  roundId,
  roundName,
  courseId,
}: {
  roundId: string;
  roundName: string;
  courseId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tracker", roundId],
    queryFn: () => api<Tracker>(`/api/rounds/${roundId}/tracker?courseId=${courseId}`),
    enabled: open,
  });

  const nudge = useMutation({
    mutationFn: (userIds?: string[]) =>
      api<{ nudged: number }>(`/api/rounds/${roundId}/nudge?courseId=${courseId}`, {
        method: "POST",
        body: JSON.stringify({ userIds: userIds && userIds.length > 0 ? userIds : undefined }),
      }),
    onSuccess: ({ nudged }) => {
      toast.success(nudged === 0 ? "No outstanding students to remind" : `Reminded ${nudged} student(s)`);
      setSelected(new Set());
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const outstanding = (data?.students ?? []).filter((s) => s.status !== "submitted");
  const isOpen = data?.roundStatus === "OPEN";
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOutstandingSelected =
    outstanding.length > 0 && outstanding.every((s) => selected.has(s.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Track
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{roundName} — submission tracker</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.counts.submitted} of ${data.counts.total} submitted · ${data.counts.started} in progress · ${data.counts.pending - data.counts.started} not started`
              : "Loading submission status…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrolled students.</p>
        ) : (
          <>
            {isOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => nudge.mutate([...selected])}
                  disabled={nudge.isPending || outstanding.length === 0}
                >
                  {selected.size > 0
                    ? `Send reminder to ${selected.size} selected`
                    : `Send reminder to all ${outstanding.length} outstanding`}
                </Button>
                {outstanding.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        allOutstandingSelected ? new Set() : new Set(outstanding.map((s) => s.id)),
                      )
                    }
                  >
                    {allOutstandingSelected ? "Clear selection" : "Select all outstanding"}
                  </Button>
                )}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  {isOpen && <TableHead className="w-8" aria-label="Select" />}
                  <TableHead>Student</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.students.map((s) => (
                  <TableRow key={s.id}>
                    {isOpen && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.name}`}
                          className="size-4 accent-primary disabled:opacity-40"
                          checked={selected.has(s.id)}
                          disabled={s.status === "submitted"}
                          onChange={() => toggle(s.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.team?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

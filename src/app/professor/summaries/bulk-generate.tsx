"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BULK_KIND_ORDER, kindByValue } from "./kinds";

type Round = { id: string; name: string; sprint: number };
type BulkStatus = {
  status: "pending" | "running" | "done" | "failed";
  done: number;
  total: number;
  error: string | null;
};

const KINDS = BULK_KIND_ORDER.map((v) => kindByValue.get(v)!);

export function BulkGenerate({ courseId, rounds }: { courseId: string; rounds: Round[] }) {
  const qc = useQueryClient();
  const [roundId, setRoundId] = useState("");
  const [kind, setKind] = useState("STUDENT_FEEDBACK");
  const [subjectType, setSubjectType] = useState<"STUDENT" | "TEAM">("STUDENT");
  const [jobId, setJobId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      api<{ jobId: string; total: number }>(`/api/summaries/bulk?courseId=${courseId}`, {
        method: "POST",
        body: JSON.stringify({ roundId, kind, subjectType }),
      }),
    onSuccess: ({ jobId, total }) => {
      setJobId(jobId);
      toast.success(`Queued ${total} summar${total === 1 ? "y" : "ies"}…`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: status } = useQuery({
    queryKey: ["bulk-status", jobId],
    queryFn: () => api<BulkStatus>(`/api/summaries/bulk/${jobId}?courseId=${courseId}`),
    enabled: !!jobId,
    // Poll while work is outstanding; stop once terminal.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "done" || s === "failed") {
        qc.invalidateQueries({ queryKey: ["summaries"] });
        return false;
      }
      return 1500;
    },
  });

  const pct = status && status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
  const busy = start.isPending || status?.status === "pending" || status?.status === "running";
  const selectedKind = kindByValue.get(kind);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk generate</CardTitle>
        <CardDescription>
          Generates one summary for every student (or team) with feedback in a round, in the
          background. Subjects that already have this summary type are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!roundId) {
              toast.error("Choose a round");
              return;
            }
            start.mutate();
          }}
        >
          <div className="space-y-1">
            <Label>Round</Label>
            <Select value={roundId || undefined} onValueChange={setRoundId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choose round" />
              </SelectTrigger>
              <SelectContent>
                {rounds.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} (Sprint {r.sprint})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>For each</Label>
            <Select value={subjectType} onValueChange={(v) => setSubjectType(v as "STUDENT" | "TEAM")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">Student</SelectItem>
                <SelectItem value="TEAM">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Generating…" : "Generate for all"}
          </Button>
          {selectedKind && (
            <p className="w-full text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedKind.label}:</span>{" "}
              {selectedKind.blurb}
            </p>
          )}
        </form>

        {status && (
          <div className="space-y-1" aria-live="polite">
            <Progress value={status.status === "done" ? 100 : pct} />
            <p className="text-xs text-muted-foreground">
              {status.status === "failed"
                ? `Failed: ${status.error ?? "unknown error"}`
                : status.status === "done"
                  ? `Done — ${status.done} of ${status.total} generated.${
                      status.error ? ` (${status.error})` : ""
                    }`
                  : `Generating ${status.done} of ${status.total}…`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

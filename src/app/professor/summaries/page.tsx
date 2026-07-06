"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Round = { id: string; name: string; sprint: number };
type Team = { id: string; name: string };
type Student = { id: string; name: string };
type Summary = {
  id: string;
  kind: string;
  subjectType: "ROUND" | "TEAM" | "STUDENT";
  subjectId: string | null;
  content: string;
  model: string;
  createdAt: string;
  round: { name: string; sprint: number };
};

const KINDS = [
  { value: "INSTRUCTOR", label: "Instructor briefing" },
  { value: "COMPLAINTS", label: "Complaint summary" },
  { value: "POSITIVES", label: "Positive summary" },
  { value: "CONSTRUCTIVE", label: "Constructive feedback" },
  { value: "STUDENT_FEEDBACK", label: "Student-shareable feedback" },
];

export default function SummariesPage() {
  const qc = useQueryClient();
  const { data: rounds } = useQuery({ queryKey: ["rounds"], queryFn: () => api<Round[]>("/api/rounds") });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: () => api<Team[]>("/api/teams") });
  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: () => api<Student[]>("/api/students"),
  });
  const { data: summaries, isLoading } = useQuery({
    queryKey: ["summaries"],
    queryFn: () => api<Summary[]>("/api/summaries"),
  });

  const [roundId, setRoundId] = useState("");
  const [kind, setKind] = useState("INSTRUCTOR");
  const [subjectType, setSubjectType] = useState<"ROUND" | "TEAM" | "STUDENT">("ROUND");
  const [subjectId, setSubjectId] = useState("");

  const generate = useMutation({
    mutationFn: () =>
      api("/api/summaries", {
        method: "POST",
        body: JSON.stringify({
          roundId,
          kind,
          subjectType,
          subjectId: subjectType === "ROUND" ? undefined : subjectId,
        }),
      }),
    onSuccess: () => {
      toast.success("Summary generated");
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subjectOptions = subjectType === "TEAM" ? teams : subjectType === "STUDENT" ? students : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate AI summary</CardTitle>
          <CardDescription>
            Summarizes written feedback from a round. Reviewer identities are never included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!roundId) {
                toast.error("Choose a round");
                return;
              }
              if (subjectType !== "ROUND" && !subjectId) {
                toast.error("Choose a subject");
                return;
              }
              generate.mutate();
            }}
          >
            <div className="space-y-1">
              <Label>Round</Label>
              <Select value={roundId || undefined} onValueChange={setRoundId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Choose round" />
                </SelectTrigger>
                <SelectContent>
                  {rounds?.map((r) => (
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
              <Label>Scope</Label>
              <Select
                value={subjectType}
                onValueChange={(v) => {
                  setSubjectType(v as typeof subjectType);
                  setSubjectId("");
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUND">Whole round</SelectItem>
                  <SelectItem value="TEAM">Team</SelectItem>
                  <SelectItem value="STUDENT">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {subjectType !== "ROUND" && (
              <div className="space-y-1">
                <Label>{subjectType === "TEAM" ? "Team" : "Student"}</Label>
                <Select value={subjectId || undefined} onValueChange={setSubjectId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectOptions?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summaries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !summaries || summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No summaries generated yet.</p>
          ) : (
            <ul className="space-y-4">
              {summaries.map((s) => (
                <li key={s.id} className="rounded-md border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge>{KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</Badge>
                    <Badge variant="outline">{s.subjectType}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.round.name} (Sprint {s.round.sprint}) · {s.model} ·{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{s.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

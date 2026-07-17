"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BulkGenerate } from "./bulk-generate";

type Round = { id: string; name: string; sprint: number };
type Team = { id: string; name: string };
type Student = { id: string; name: string };
type StudentPage = { items: Student[]; total: number };
type Summary = {
  id: string;
  kind: string;
  subjectType: "ROUND" | "TEAM" | "STUDENT";
  subjectId: string | null;
  content: string;
  model: string;
  status: "DRAFT" | "RELEASED";
  releasedAt: string | null;
  createdAt: string;
  round: { name: string; sprint: number };
};
type SummaryPage = { items: Summary[]; total: number; page: number; pageSize: number };

const KINDS = [
  { value: "INSTRUCTOR", label: "Instructor briefing" },
  { value: "COMPLAINTS", label: "Complaint summary" },
  { value: "POSITIVES", label: "Positive summary" },
  { value: "CONSTRUCTIVE", label: "Constructive feedback" },
  { value: "STUDENT_FEEDBACK", label: "Student-shareable feedback" },
];

const PAGE_SIZE = 20;

export default function SummariesPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const [page, setPage] = useState(1);
  const { data: rounds } = useQuery({
    queryKey: ["rounds", course.id],
    queryFn: () => api<Round[]>(`/api/rounds?courseId=${course.id}`),
  });
  const { data: teams } = useQuery({
    queryKey: ["teams", course.id],
    queryFn: () => api<Team[]>(`/api/teams?courseId=${course.id}`),
  });
  const { data: students } = useQuery({
    queryKey: ["students", course.id, "all"],
    queryFn: () => api<StudentPage>(`/api/students?courseId=${course.id}&pageSize=200`),
  });
  const { data: summaries, isLoading } = useQuery({
    queryKey: ["summaries", course.id, page],
    queryFn: () =>
      api<SummaryPage>(`/api/summaries?courseId=${course.id}&page=${page}&pageSize=${PAGE_SIZE}`),
  });

  const [roundId, setRoundId] = useState("");
  const [kind, setKind] = useState("INSTRUCTOR");
  const [subjectType, setSubjectType] = useState<"ROUND" | "TEAM" | "STUDENT">("ROUND");
  const [subjectId, setSubjectId] = useState("");

  const generate = useMutation({
    mutationFn: () =>
      api(`/api/summaries?courseId=${course.id}`, {
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

  const release = useMutation({
    mutationFn: (id: string) =>
      api(`/api/summaries/${id}/release?courseId=${course.id}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Released to student");
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subjectOptions =
    subjectType === "TEAM" ? teams : subjectType === "STUDENT" ? students?.items : [];
  const totalPages = summaries ? Math.max(1, Math.ceil(summaries.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate AI summary</CardTitle>
          <CardDescription>
            Summarizes written feedback from a round. Reviewer identities are never included.
            Student-shareable feedback stays private until you release it.
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

      <BulkGenerate courseId={course.id} rounds={rounds ?? []} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summaries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !summaries || summaries.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No summaries generated yet.</p>
          ) : (
            <>
              <ul className="space-y-4">
                {summaries.items.map((s) => (
                  <li key={s.id} className="rounded-md border p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge>{KINDS.find((k) => k.value === s.kind)?.label ?? s.kind}</Badge>
                      <Badge variant="outline">{s.subjectType}</Badge>
                      {s.kind === "STUDENT_FEEDBACK" &&
                        (s.status === "RELEASED" ? (
                          <Badge variant="secondary">
                            Released {s.releasedAt ? new Date(s.releasedAt).toLocaleDateString() : ""}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Not released</Badge>
                        ))}
                      <span className="text-xs text-muted-foreground">
                        {s.round.name} (Sprint {s.round.sprint}) · {s.model} ·{" "}
                        {new Date(s.createdAt).toLocaleString()}
                      </span>
                      {s.kind === "STUDENT_FEEDBACK" && s.status === "DRAFT" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() => release.mutate(s.id)}
                          disabled={release.isPending}
                        >
                          Release to student
                        </Button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{s.content}</p>
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <nav
                  aria-label="Summary pages"
                  className="mt-4 flex items-center justify-end gap-2 text-sm"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

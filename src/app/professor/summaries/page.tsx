"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { BulkGenerate } from "./bulk-generate";
import { SUMMARY_KINDS as KINDS } from "./kinds";

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
  editedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  round: { name: string; sprint: number };
};
type SummaryPage = { items: Summary[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 20;

export default function SummariesPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const [page, setPage] = useState(1);

  // First-time explainer: shown until the instructor dismisses it, then
  // reopenable from the header. Its dismissed state persists in localStorage
  // (same lazy-init pattern the evaluation form uses for its draft).
  const GUIDE_KEY = "peerpulse-summaries-guide-dismissed";
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(GUIDE_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const dismissGuide = () => {
    setShowGuide(false);
    try {
      window.localStorage.setItem(GUIDE_KEY, "1");
    } catch {
      // best-effort; the guide simply reappears next visit
    }
  };
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

  // Which draft is open for editing, and its working text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const beginEdit = (s: Summary) => {
    setEditingId(s.id);
    setDraft(s.content);
  };
  const edit = useMutation({
    mutationFn: (id: string) =>
      api(`/api/summaries/${id}?courseId=${course.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: draft }),
      }),
    onSuccess: () => {
      toast.success("Summary updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["summaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subjectOptions =
    subjectType === "TEAM" ? teams : subjectType === "STUDENT" ? students?.items : [];
  const selectedKind = KINDS.find((k) => k.value === kind);
  const totalPages = summaries ? Math.max(1, Math.ceil(summaries.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      {showGuide && (
        <Alert className="relative pr-10">
          <Info />
          <button
            type="button"
            aria-label="Dismiss guide"
            onClick={dismissGuide}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <AlertTitle>New here? How AI summaries work</AlertTitle>
          <AlertDescription>
            <p>
              PeerPulse reads the anonymous written feedback from a round and drafts a summary
              for you. Reviewer identities are never included. The flow is always:
            </p>
            <p>
              <strong>1. Generate</strong> a draft &rarr; <strong>2. Review &amp; edit</strong> the
              text &rarr; <strong>3. Release</strong> it to the student (student-shareable type only).
            </p>
            <p className="font-medium text-foreground">Pick the type that matches what you need:</p>
            <ul className="grid gap-1">
              {KINDS.map((k) => (
                <li key={k.value}>
                  <span className="font-medium text-foreground">{k.label}</span>
                  {k.shareable && (
                    <Badge variant="secondary" className="ml-1.5 align-middle">
                      Can be sent to students
                    </Badge>
                  )}{" "}
                  — {k.blurb}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base">Generate AI summary</CardTitle>
            {!showGuide && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="-mt-1 h-auto gap-1 px-2 py-1 text-xs text-muted-foreground"
                onClick={() => setShowGuide(true)}
              >
                <Info className="size-3.5" /> How it works
              </Button>
            )}
          </div>
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
            {selectedKind && (
              <p className="w-full text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selectedKind.label}:</span>{" "}
                {selectedKind.blurb}
              </p>
            )}
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
                      {s.editedAt && <Badge variant="outline">Edited by instructor</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {s.round.name} (Sprint {s.round.sprint}) · {s.model} ·{" "}
                        {new Date(s.createdAt).toLocaleString()}
                      </span>
                      {s.status === "DRAFT" && editingId !== s.id && (
                        <div className="ml-auto flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => beginEdit(s)}>
                            Edit
                          </Button>
                          {s.kind === "STUDENT_FEEDBACK" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => release.mutate(s.id)}
                              disabled={release.isPending}
                            >
                              Release to student
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {editingId === s.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={draft}
                          maxLength={20_000}
                          rows={Math.min(20, Math.max(6, draft.split("\n").length + 1))}
                          onChange={(e) => setDraft(e.target.value)}
                          aria-label="Edit summary text"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => edit.mutate(s.id)}
                            disabled={edit.isPending || !draft.trim()}
                          >
                            {edit.isPending ? "Saving…" : "Save changes"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={edit.isPending}
                          >
                            Cancel
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Review and revise before releasing — students see exactly this text.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{s.content}</p>
                    )}
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

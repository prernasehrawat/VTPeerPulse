"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendsChart } from "./trends-chart";

type Round = { id: string; name: string; sprint: number; status: string };
type Analytics = {
  roundId: string;
  overallAverage: number | null;
  totalStudents: number;
  submittedCount: number;
  completionPct: number;
  teams: {
    teamId: string;
    name: string;
    average: number | null;
    memberCount: number;
    submittedCount: number;
    completionPct: number;
  }[];
  students: {
    userId: string;
    name: string;
    teamName: string | null;
    average: number | null;
    ratingsCount: number;
    submitted: boolean;
  }[];
  questions: {
    questionId: string;
    prompt: string;
    average: number | null;
    count: number;
    distribution: number[];
  }[];
};
export type TrendPoint = {
  roundId: string;
  roundName: string;
  sprint: number;
  overallAverage: number | null;
  completionPct: number;
  teams: Record<string, number | null>;
};

export default function AnalyticsPage() {
  const { course } = useCourse();
  const { data: rounds } = useQuery({
    queryKey: ["rounds", course.id],
    queryFn: () => api<Round[]>(`/api/rounds?courseId=${course.id}`),
  });
  const [roundId, setRoundId] = useState<string | null>(null);
  const selectedId = roundId ?? rounds?.[0]?.id ?? null;

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["analytics", course.id, selectedId],
    queryFn: () => api<Analytics>(`/api/analytics/rounds/${selectedId}?courseId=${course.id}`),
    enabled: !!selectedId,
  });
  const { data: trends } = useQuery({
    queryKey: ["trends", course.id],
    queryFn: () => api<TrendPoint[]>(`/api/analytics/trends?courseId=${course.id}`),
  });

  if (!rounds) return <Skeleton className="h-64 w-full" />;
  if (rounds.length === 0) {
    return <p className="text-sm text-muted-foreground">Create an evaluation round to see analytics.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="round-select">
          Round
        </label>
        <Select value={selectedId ?? undefined} onValueChange={setRoundId}>
          <SelectTrigger id="round-select" className="w-64">
            <SelectValue />
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

      {isLoading || !analytics ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Overall average</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {analytics.overallAverage ?? "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completion</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{analytics.completionPct}%</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Submissions</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {analytics.submittedCount} / {analytics.totalStudents}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team averages</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Average</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead>Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.teams.map((t) => (
                    <TableRow key={t.teamId}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="tabular-nums">{t.average ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{t.completionPct}%</TableCell>
                      <TableCell className="tabular-nums">{t.memberCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Student averages</CardTitle>
              <CardDescription>Average score each student received from teammates.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Average received</TableHead>
                    <TableHead>Ratings</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.students.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.teamName ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{s.average ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{s.ratingsCount}</TableCell>
                      <TableCell>
                        {s.submitted ? (
                          <Badge variant="outline">Yes</Badge>
                        ) : (
                          <Badge variant="destructive">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question statistics</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rating data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Responses</TableHead>
                      <TableHead>Distribution (1→5)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.questions.map((q) => (
                      <TableRow key={q.questionId}>
                        <TableCell className="max-w-md">{q.prompt}</TableCell>
                        <TableCell className="tabular-nums">{q.average ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{q.count}</TableCell>
                        <TableCell className="tabular-nums">{q.distribution.join(" · ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trends across rounds</CardTitle>
          <CardDescription>Score history per sprint; teams are directly comparable.</CardDescription>
        </CardHeader>
        <CardContent>
          {!trends || trends.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Trends appear once at least two rounds have submissions.
            </p>
          ) : (
            <TrendsChart trends={trends} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

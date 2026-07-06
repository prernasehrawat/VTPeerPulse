"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Round = {
  id: string;
  name: string;
  sprint: number;
  status: "DRAFT" | "OPEN" | "CLOSED";
  opensAt: string | null;
  closesAt: string | null;
  _count: { submissions: number };
};

const STATUS_BADGE: Record<Round["status"], "default" | "secondary" | "outline"> = {
  OPEN: "default",
  DRAFT: "outline",
  CLOSED: "secondary",
};

export default function RoundsPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const { data: rounds, isLoading } = useQuery({
    queryKey: ["rounds", course.id],
    queryFn: () => api<Round[]>(`/api/rounds?courseId=${course.id}`),
  });
  const [name, setName] = useState("");
  const [sprint, setSprint] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rounds"] });

  const create = useMutation({
    mutationFn: () =>
      api(`/api/rounds?courseId=${course.id}`, {
        method: "POST",
        body: JSON.stringify({ name, sprint: Number(sprint) }),
      }),
    onSuccess: () => {
      toast.success("Round created");
      setName("");
      setSprint("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Round["status"] }) =>
      api(`/api/rounds/${id}/status?courseId=${course.id}`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "OPEN" ? "Round opened" : "Round closed — analytics generated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/rounds/${id}?courseId=${course.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Round deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create evaluation round</CardTitle>
          <CardDescription>One round per sprint. Only one round can be open at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="round-name">Name</Label>
              <Input
                id="round-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint 3 Evaluation"
                required
                className="w-64"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="round-sprint">Sprint #</Label>
              <Input
                id="round-sprint"
                type="number"
                min={1}
                max={100}
                value={sprint}
                onChange={(e) => setSprint(e.target.value)}
                required
                className="w-24"
              />
            </div>
            <Button type="submit" disabled={create.isPending}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All rounds</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !rounds || rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rounds yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round</TableHead>
                  <TableHead>Sprint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.sprint}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r._count.submissions}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {(r.status === "DRAFT" || r.status === "CLOSED") && (
                        <Button
                          size="sm"
                          onClick={() => setStatus.mutate({ id: r.id, status: "OPEN" })}
                          disabled={setStatus.isPending}
                        >
                          Open
                        </Button>
                      )}
                      {r.status === "OPEN" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setStatus.mutate({ id: r.id, status: "CLOSED" })}
                          disabled={setStatus.isPending}
                        >
                          Close
                        </Button>
                      )}
                      {r._count.submissions === 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => remove.mutate(r.id)}
                          disabled={remove.isPending}
                        >
                          Delete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

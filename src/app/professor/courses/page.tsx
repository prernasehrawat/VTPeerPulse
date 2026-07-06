"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { COURSE_COOKIE } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Course = {
  id: string;
  code: string;
  name: string;
  term: string;
  active: boolean;
  _count: { enrollments: number; teams: number; rounds: number };
};

export default function CoursesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api<Course[]>("/api/courses"),
  });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<Course>("/api/courses", {
        method: "POST",
        body: JSON.stringify({ code, name, term }),
      }),
    onSuccess: (course) => {
      toast.success("Course created");
      setCode("");
      setName("");
      setTerm("");
      document.cookie = `${COURSE_COOKIE}=${encodeURIComponent(course.id)}; path=/; max-age=31536000; samesite=lax`;
      qc.invalidateQueries({ queryKey: ["courses"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/api/courses/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create course</CardTitle>
          <CardDescription>
            Each course has its own roster, teams, questions, and evaluation rounds.
          </CardDescription>
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
              <Label htmlFor="c-code">Code</Label>
              <Input
                id="c-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CS 3704"
                required
                className="w-36"
              />
            </div>
            <div className="min-w-64 flex-1 space-y-1">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Software Engineering Capstone"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-term">Term</Label>
              <Input
                id="c-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Fall 2026"
                required
                className="w-36"
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
          <CardTitle className="text-base">My courses</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !courses || courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet — create one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Rounds</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.code} — {c.name}
                    </TableCell>
                    <TableCell>{c.term}</TableCell>
                    <TableCell className="tabular-nums">{c._count.enrollments}</TableCell>
                    <TableCell className="tabular-nums">{c._count.teams}</TableCell>
                    <TableCell className="tabular-nums">{c._count.rounds}</TableCell>
                    <TableCell>
                      {c.active ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Archived</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: c.id, active: !c.active })}
                        disabled={update.isPending}
                      >
                        {c.active ? "Archive" : "Restore"}
                      </Button>
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

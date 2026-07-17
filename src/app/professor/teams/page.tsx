"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Student = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  canLogIn: boolean;
  team: { id: string; name: string } | null;
};
type StudentPage = { items: Student[]; total: number; page: number; pageSize: number };
type Team = {
  id: string;
  name: string;
  memberships: { user: { id: string; name: string; email: string; active: boolean } }[];
};
type ImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  teamsCreated: number;
  invitesSent: number;
  errors: { row: number; message: string }[];
};

const NO_TEAM = "__none__";
const PAGE_SIZE = 50;

export default function TeamsPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [page, setPage] = useState(1);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ["students", course.id, page],
    queryFn: () =>
      api<StudentPage>(`/api/students?courseId=${course.id}&page=${page}&pageSize=${PAGE_SIZE}`),
  });
  const { data: teams } = useQuery({
    queryKey: ["teams", course.id],
    queryFn: () => api<Team[]>(`/api/teams?courseId=${course.id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  };

  const runImport = useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("dryRun", String(dryRun));
      return api<ImportResult>(`/api/import?courseId=${course.id}`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: (r) => {
      if (r.dryRun) {
        setPreview(r);
        return;
      }
      setPreview(null);
      setPendingFile(null);
      setImportResult(r);
      if (r.errors.length === 0) toast.success("Roster imported");
      else toast.warning(`Imported with ${r.errors.length} row error(s)`);
      invalidate();
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invite = useMutation({
    mutationFn: () =>
      api<{ invited: number; sent: number }>(`/api/courses/${course.id}/invites`, {
        method: "POST",
      }),
    onSuccess: (r) => {
      toast.success(
        r.invited === 0
          ? "Everyone can already sign in — no invites needed"
          : `Sent ${r.sent} of ${r.invited} invite email(s)`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStudent = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; teamId?: string | null; active?: boolean }) =>
      api(`/api/students/${id}?courseId=${course.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPages = students ? Math.max(1, Math.ceil(students.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import roster (CSV)</CardTitle>
          <CardDescription>
            Columns: <code>Team, Student Name, University Email</code>. You&apos;ll see a preview
            before anything is saved. New students receive an email invite to set their password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="max-w-sm"
              aria-label="Roster CSV file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPendingFile(file);
                  setImportResult(null);
                  runImport.mutate({ file, dryRun: true });
                }
              }}
            />
            {runImport.isPending && (
              <span className="text-sm text-muted-foreground" role="status">
                {preview || !pendingFile ? "Importing…" : "Checking…"}
              </span>
            )}
          </div>

          {preview && pendingFile && (
            <div className="rounded-md border p-3 text-sm">
              <p className="mb-2 font-medium">
                Preview — nothing has been imported yet ({pendingFile.name})
              </p>
              <p>
                Will create <strong>{preview.created}</strong> student(s), update{" "}
                <strong>{preview.updated}</strong>, add <strong>{preview.teamsCreated}</strong> new
                team(s).
              </p>
              {preview.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-destructive">
                  {preview.errors.map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => runImport.mutate({ file: pendingFile, dryRun: false })}
                  disabled={runImport.isPending || preview.created + preview.updated === 0}
                >
                  Confirm import
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setPendingFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {importResult && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Created <strong>{importResult.created}</strong>, updated{" "}
                <strong>{importResult.updated}</strong>, new teams{" "}
                <strong>{importResult.teamsCreated}</strong>, invites sent{" "}
                <strong>{importResult.invitesSent}</strong>.
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-destructive">
                  {importResult.errors.map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Teams</CardTitle>
        </CardHeader>
        <CardContent>
          {!teams || teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet — import a roster above.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((t) => (
                <div key={t.id} className="rounded-md border p-4">
                  <h3 className="mb-2 font-medium">{t.name}</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {t.memberships.map((m) => (
                      <li key={m.user.id}>
                        {m.user.name}
                        {!m.user.active && " (inactive)"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Students</CardTitle>
            <CardDescription>Reassign teams or deactivate students who dropped.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => invite.mutate()}
            disabled={invite.isPending}
          >
            {invite.isPending ? "Sending…" : "Send pending invites"}
          </Button>
        </CardHeader>
        <CardContent>
          {loadingStudents ? (
            <Skeleton className="h-40 w-full" />
          ) : !students || students.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>
                        <Select
                          value={s.team?.id ?? NO_TEAM}
                          onValueChange={(v) =>
                            updateStudent.mutate({ id: s.id, teamId: v === NO_TEAM ? null : v })
                          }
                        >
                          <SelectTrigger className="w-40" aria-label={`Team for ${s.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_TEAM}>No team</SelectItem>
                            {teams?.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {s.active ? (
                            <Badge variant="outline">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          {!s.canLogIn && <Badge variant="secondary">Invite pending</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStudent.mutate({ id: s.id, active: !s.active })}
                          disabled={updateStudent.isPending}
                        >
                          {s.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <nav
                  aria-label="Student pages"
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

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
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
  membership: { team: { id: string; name: string } } | null;
};
type Team = {
  id: string;
  name: string;
  memberships: { user: { id: string; name: string; email: string; active: boolean } }[];
};
type ImportResult = {
  created: number;
  updated: number;
  teamsCreated: number;
  errors: { row: number; message: string }[];
};

const NO_TEAM = "__none__";

export default function TeamsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ["students"],
    queryFn: () => api<Student[]>("/api/students"),
  });
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/api/teams"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<ImportResult>("/api/import", { method: "POST", body: form });
    },
    onSuccess: (r) => {
      setImportResult(r);
      if (r.errors.length === 0) toast.success("Roster imported");
      else toast.warning(`Imported with ${r.errors.length} row error(s)`);
      invalidate();
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStudent = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; teamId?: string | null; active?: boolean }) =>
      api(`/api/students/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import roster (CSV)</CardTitle>
          <CardDescription>
            Columns: <code>Team, Student Name, University Email</code>. New students are created;
            existing students are updated and reassigned safely.
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
                if (file) upload.mutate(file);
              }}
            />
            {upload.isPending && <span className="text-sm text-muted-foreground">Importing…</span>}
          </div>
          {importResult && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Created <strong>{importResult.created}</strong>, updated{" "}
                <strong>{importResult.updated}</strong>, new teams{" "}
                <strong>{importResult.teamsCreated}</strong>.
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
        <CardHeader>
          <CardTitle className="text-base">Students</CardTitle>
          <CardDescription>Reassign teams or deactivate students who dropped.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStudents ? (
            <Skeleton className="h-40 w-full" />
          ) : !students || students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students yet.</p>
          ) : (
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
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.email}</TableCell>
                    <TableCell>
                      <Select
                        value={s.membership?.team.id ?? NO_TEAM}
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
                      {s.active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

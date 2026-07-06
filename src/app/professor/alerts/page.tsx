"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type AlertRow = {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  resolved: boolean;
  createdAt: string;
  round: { name: string; sprint: number } | null;
  team: { name: string } | null;
};
type AlertPage = { items: AlertRow[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 25;

export default function AlertsPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["alerts", course.id, page],
    queryFn: () =>
      api<AlertPage>(`/api/alerts?courseId=${course.id}&page=${page}&pageSize=${PAGE_SIZE}`),
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api(`/api/alerts/${id}/resolve?courseId=${course.id}`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Alert resolved");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
        <CardDescription>
          Generated automatically when a round closes: low averages, downward trends, repeated
          concerns, and missing submissions. Thresholds are configurable under Reports &amp;
          Settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unresolved alerts.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {data.items.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant={a.severity === "CRITICAL" ? "destructive" : "secondary"}>
                        {a.severity}
                      </Badge>
                      <Badge variant="outline">{a.type.replaceAll("_", " ")}</Badge>
                      {a.round && (
                        <span className="text-xs text-muted-foreground">
                          {a.round.name} (Sprint {a.round.sprint})
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{a.message}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve.mutate(a.id)}
                    disabled={resolve.isPending}
                  >
                    Resolve
                  </Button>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <nav aria-label="Alert pages" className="mt-4 flex items-center justify-end gap-2 text-sm">
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
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Alert = {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  resolved: boolean;
  createdAt: string;
  round: { name: string; sprint: number } | null;
  team: { name: string } | null;
};

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api<Alert[]>("/api/alerts"),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api(`/api/alerts/${id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Alert resolved");
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
        ) : !alerts || alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unresolved alerts.</p>
        ) : (
          <ul className="space-y-3">
            {alerts.map((a) => (
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
        )}
      </CardContent>
    </Card>
  );
}

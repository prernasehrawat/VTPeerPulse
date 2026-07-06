"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useCourse } from "@/components/course-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Round = { id: string; name: string; sprint: number };
type Thresholds = { lowAverage: number; trendDrop: number; repeatedConcernRounds: number };

export default function ReportsPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const { data: rounds } = useQuery({
    queryKey: ["rounds", course.id],
    queryFn: () => api<Round[]>(`/api/rounds?courseId=${course.id}`),
  });
  const { data: thresholds } = useQuery({
    queryKey: ["thresholds"],
    queryFn: () => api<Thresholds>("/api/settings/thresholds"),
  });

  const [roundId, setRoundId] = useState("");
  const [edited, setEdited] = useState<Thresholds | null>(null);
  const form = edited ?? thresholds ?? null;
  const setForm = setEdited;

  const save = useMutation({
    mutationFn: (t: Thresholds) =>
      api("/api/settings/thresholds", { method: "PUT", body: JSON.stringify(t) }),
    onSuccess: () => {
      toast.success("Thresholds saved");
      qc.invalidateQueries({ queryKey: ["thresholds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export reports</CardTitle>
          <CardDescription>Download round data as CSV.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Round</Label>
            <Select value={roundId || undefined} onValueChange={setRoundId}>
              <SelectTrigger className="w-64">
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
          <Button asChild variant="outline" disabled={!roundId}>
            <a
              href={roundId ? `/api/reports/rounds/${roundId}?kind=analytics&courseId=${course.id}` : "#"}
              aria-disabled={!roundId}
            >
              Analytics CSV
            </a>
          </Button>
          <Button asChild variant="outline" disabled={!roundId}>
            <a
              href={roundId ? `/api/reports/rounds/${roundId}?kind=responses&courseId=${course.id}` : "#"}
              aria-disabled={!roundId}
            >
              Full responses CSV
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alert thresholds</CardTitle>
          <CardDescription>
            Used when a round closes to flag low averages, downward trends, and repeated concerns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {form && (
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="t-low">Low average (1–5)</Label>
                <Input
                  id="t-low"
                  type="number"
                  step="0.1"
                  min={1}
                  max={5}
                  className="w-32"
                  value={form.lowAverage}
                  onChange={(e) => setForm({ ...form, lowAverage: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-drop">Trend drop</Label>
                <Input
                  id="t-drop"
                  type="number"
                  step="0.1"
                  min={0.1}
                  max={4}
                  className="w-32"
                  value={form.trendDrop}
                  onChange={(e) => setForm({ ...form, trendDrop: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-rounds">Repeated concern (rounds)</Label>
                <Input
                  id="t-rounds"
                  type="number"
                  min={2}
                  max={10}
                  className="w-32"
                  value={form.repeatedConcernRounds}
                  onChange={(e) =>
                    setForm({ ...form, repeatedConcernRounds: Number(e.target.value) })
                  }
                />
              </div>
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

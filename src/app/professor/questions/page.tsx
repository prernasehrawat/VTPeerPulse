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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Question = {
  id: string;
  prompt: string;
  type: "RATING" | "TEXT";
  required: boolean;
  active: boolean;
  order: number;
};

export default function QuestionsPage() {
  const qc = useQueryClient();
  const { course } = useCourse();
  const { data: questions, isLoading } = useQuery({
    queryKey: ["questions", course.id],
    queryFn: () => api<Question[]>(`/api/questions?courseId=${course.id}`),
  });
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<"RATING" | "TEXT">("RATING");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["questions", course.id] });
  const onError = (e: Error) => toast.error(e.message);

  const create = useMutation({
    mutationFn: () =>
      api(`/api/questions?courseId=${course.id}`, { method: "POST", body: JSON.stringify({ prompt, type }) }),
    onSuccess: () => {
      toast.success("Question added");
      setPrompt("");
      invalidate();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Question>) =>
      api(`/api/questions/${id}?courseId=${course.id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ deleted: boolean; deactivated: boolean }>(`/api/questions/${id}?courseId=${course.id}`, {
        method: "DELETE",
      }),
    onSuccess: (r) => {
      toast.success(r.deleted ? "Question deleted" : "Question has answers — disabled instead");
      invalidate();
    },
    onError,
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api(`/api/questions/reorder?courseId=${course.id}`, { method: "POST", body: JSON.stringify({ orderedIds }) }),
    onSuccess: invalidate,
    onError,
  });

  function move(index: number, dir: -1 | 1) {
    if (!questions) return;
    const ids = questions.map((q) => q.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add question</CardTitle>
          <CardDescription>
            Rating questions collect a 1–5 score plus an optional comment. Text questions collect a
            written answer.
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
            <div className="min-w-72 flex-1 space-y-1">
              <Label htmlFor="q-prompt">Prompt</Label>
              <Input
                id="q-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="How well did this teammate communicate?"
                required
                minLength={3}
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "RATING" | "TEXT")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RATING">Rating 1–5</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={create.isPending}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions</CardTitle>
          <CardDescription>Order here is the order students see.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !questions || questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions yet — add one above.</p>
          ) : (
            <ul className="space-y-2">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      aria-label={`Move "${q.prompt}" up`}
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      aria-label={`Move "${q.prompt}" down`}
                      disabled={i === questions.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingId === q.id ? (
                      <form
                        className="flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          update.mutate({ id: q.id, prompt: editPrompt });
                        }}
                      >
                        <Input
                          className="min-w-0 flex-1"
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          minLength={3}
                          required
                        />
                        <Button size="sm" type="submit" disabled={update.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <p className={q.active ? "break-words" : "break-words text-muted-foreground line-through"}>
                          {q.prompt}
                        </p>
                        <div className="mt-1 flex gap-2">
                          <Badge variant="outline">{q.type === "RATING" ? "Rating 1–5" : "Text"}</Badge>
                          {!q.active && <Badge variant="secondary">Disabled</Badge>}
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                  {editingId !== q.id && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(q.id);
                          setEditPrompt(q.prompt);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: q.id, active: !q.active })}
                        disabled={update.isPending}
                      >
                        {q.active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => remove.mutate(q.id)}
                        disabled={remove.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Teammate = { id: string; name: string };
type Question = { id: string; prompt: string; type: "RATING" | "TEXT"; required: boolean };

type AnswerState = { rating?: number; comment?: string };
// keyed by `${teammateId}:${questionId}`
type FormState = Record<string, AnswerState>;

export function EvaluationForm({
  roundId,
  teammates,
  questions,
}: {
  roundId: string;
  teammates: Teammate[];
  questions: Question[];
}) {
  const router = useRouter();
  const draftKey = `peerpulse-draft-${roundId}`;
  // Restore an in-progress draft so an accidental refresh never loses answers.
  const [state, setState] = useState<FormState>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as FormState) : {};
    } catch {
      return {};
    }
  });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (Object.keys(state).length > 0) {
          window.localStorage.setItem(draftKey, JSON.stringify(state));
        }
      } catch {
        // Storage full/unavailable — autosave is best-effort.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [state, draftKey]);

  const setAnswer = (teammateId: string, questionId: string, patch: AnswerState) =>
    setState((s) => ({
      ...s,
      [`${teammateId}:${questionId}`]: { ...s[`${teammateId}:${questionId}`], ...patch },
    }));

  const mutation = useMutation({
    mutationFn: () =>
      api("/api/evaluations", {
        method: "POST",
        body: JSON.stringify({
          roundId,
          evaluations: teammates.map((t) => ({
            evaluateeId: t.id,
            answers: questions
              .map((q) => {
                const a = state[`${t.id}:${q.id}`] ?? {};
                return {
                  questionId: q.id,
                  rating: q.type === "RATING" ? a.rating : undefined,
                  comment: a.comment?.trim() ? a.comment.trim() : undefined,
                };
              })
              .filter((a) => a.rating !== undefined || a.comment !== undefined),
          })),
        }),
      }),
    onSuccess: () => {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // best-effort cleanup
      }
      toast.success("Evaluation submitted. Thank you!");
      router.refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function validate(): boolean {
    const problems: string[] = [];
    for (const t of teammates) {
      for (const q of questions) {
        const a = state[`${t.id}:${q.id}`] ?? {};
        if (q.type === "RATING" && q.required && a.rating === undefined) {
          problems.push(`Rate "${q.prompt}" for ${t.name}.`);
        }
        if (q.type === "TEXT" && q.required && !a.comment?.trim()) {
          problems.push(`Answer "${q.prompt}" for ${t.name}.`);
        }
      }
    }
    setErrors(problems);
    return problems.length === 0;
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (validate()) mutation.mutate();
      }}
    >
      {teammates.map((t, i) => (
        <section key={t.id} aria-labelledby={`teammate-${t.id}`}>
          {i > 0 && <Separator className="mb-8" />}
          <h3 id={`teammate-${t.id}`} className="mb-4 text-base font-semibold">
            {t.name}
          </h3>
          <div className="space-y-6">
            {questions.map((q) => {
              const a = state[`${t.id}:${q.id}`] ?? {};
              return (
                <div key={q.id} className="space-y-2">
                  <Label>
                    {q.prompt}
                    {q.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {q.type === "RATING" ? (
                    <div
                      role="radiogroup"
                      aria-label={`${q.prompt} for ${t.name}`}
                      className="flex gap-2"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={a.rating === n}
                          variant={a.rating === n ? "default" : "outline"}
                          size="sm"
                          className="w-10"
                          onClick={() => setAnswer(t.id, q.id, { rating: n })}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {q.type === "TEXT" || q.type === "RATING" ? (
                    <Textarea
                      placeholder={q.type === "RATING" ? "Optional comment…" : "Your answer…"}
                      value={a.comment ?? ""}
                      maxLength={4000}
                      onChange={(e) => setAnswer(t.id, q.id, { comment: e.target.value })}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {errors.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          <p className="mb-1 font-medium">Please complete the following:</p>
          <ul className="list-inside list-disc">
            {errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {errors.length > 6 && <li>…and {errors.length - 6} more</li>}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Submissions are final — review your answers before submitting. Your progress is saved in
          this browser as you type.
        </p>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Submitting…" : "Submit evaluation"}
        </Button>
      </div>
    </form>
  );
}

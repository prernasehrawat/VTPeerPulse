import { auth } from "@/lib/auth";
import { getOwnSubmissions } from "@/server/services/evaluations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await auth();
  const submissions = await getOwnSubmissions(session!.user.id);

  if (submissions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No submissions yet</CardTitle>
          <CardDescription>Your submitted evaluations will appear here, read-only.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Past submissions are read-only and cannot be edited.
      </p>
      {submissions.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {s.round.name}
              <Badge variant="secondary">Sprint {s.round.sprint}</Badge>
            </CardTitle>
            <CardDescription>
              Submitted {new Date(s.submittedAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.evaluations.map((e) => (
              <div key={e.id} className="rounded-md border p-4">
                <h4 className="mb-2 font-medium">{e.evaluatee.name}</h4>
                <dl className="space-y-2 text-sm">
                  {[...e.answers]
                    .sort((a, b) => a.question.order - b.question.order)
                    .map((a) => (
                      <div key={a.id}>
                        <dt className="text-muted-foreground">{a.question.prompt}</dt>
                        <dd>
                          {a.rating !== null && <span className="font-medium">{a.rating} / 5</span>}
                          {a.rating !== null && a.comment && " — "}
                          {a.comment}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

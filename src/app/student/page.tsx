import { auth } from "@/lib/auth";
import { getCurrentEvaluationContext } from "@/server/services/evaluations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvaluationForm } from "./evaluation-form";

export const dynamic = "force-dynamic";

export default async function StudentDashboard() {
  const session = await auth();
  const ctx = await getCurrentEvaluationContext(session!.user.id);

  if (!ctx.team) {
    return (
      <Alert>
        <AlertTitle>No team assigned</AlertTitle>
        <AlertDescription>
          You have not been assigned to a team yet. Contact your instructor.
        </AlertDescription>
      </Alert>
    );
  }

  if (!ctx.round) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active evaluation round</CardTitle>
          <CardDescription>
            You are on team <strong>{ctx.team.name}</strong>. Check back when your instructor opens
            the next round.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (ctx.submission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {ctx.round.name} <Badge variant="secondary">Submitted</Badge>
          </CardTitle>
          <CardDescription>
            You submitted on {new Date(ctx.submission.submittedAt).toLocaleString()}. Submissions
            are final and cannot be edited. View them under “My past submissions”.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {ctx.round.name} <Badge>Open</Badge>
          </CardTitle>
          <CardDescription>
            Team {ctx.team.name} — evaluate each teammate below. Your responses are anonymous to
            teammates and visible only to your instructor. You can submit once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ctx.teammates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no teammates to evaluate in this round.
            </p>
          ) : (
            <EvaluationForm
              roundId={ctx.round.id}
              teammates={ctx.teammates}
              questions={ctx.questions.map((q) => ({
                id: q.id,
                prompt: q.prompt,
                type: q.type,
                required: q.required,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

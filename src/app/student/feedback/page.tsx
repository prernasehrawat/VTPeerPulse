import { auth } from "@/lib/auth";
import { getReleasedFeedbackFor } from "@/server/services/summaries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "My feedback · VT PeerPulse" };

export default async function StudentFeedbackPage() {
  const session = await auth();
  const feedback = await getReleasedFeedbackFor(session!.user.id);

  if (feedback.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No feedback shared yet</CardTitle>
          <CardDescription>
            When your instructor shares anonymized peer feedback with you, it will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Anonymized feedback your instructor has shared with you. It summarizes what teammates
        wrote without identifying anyone.
      </p>
      {feedback.map((f) => (
        <Card key={f.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {f.round.name} <Badge variant="outline">Sprint {f.round.sprint}</Badge>
            </CardTitle>
            <CardDescription>
              Shared {f.releasedAt ? new Date(f.releasedAt).toLocaleDateString() : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{f.content}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

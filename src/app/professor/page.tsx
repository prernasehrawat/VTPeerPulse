import Link from "next/link";
import { db } from "@/lib/db";
import { computeRoundAnalytics, listAlerts } from "@/server/services/analytics";
import { getOpenRound } from "@/server/services/rounds";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function ProfessorOverview() {
  const [openRound, studentCount, teamCount, alerts] = await Promise.all([
    getOpenRound(),
    db.user.count({ where: { role: "STUDENT", active: true } }),
    db.team.count(),
    listAlerts(),
  ]);
  const analytics = openRound ? await computeRoundAnalytics(openRound.id) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active students" value={String(studentCount)} />
        <Stat label="Teams" value={String(teamCount)} />
        <Stat
          label="Active round completion"
          value={analytics ? `${analytics.completionPct}%` : "—"}
        />
        <Stat label="Open alerts" value={String(alerts.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Active round
            {openRound ? <Badge>Open</Badge> : <Badge variant="secondary">None</Badge>}
          </CardTitle>
          <CardDescription>
            {openRound ? (
              <>
                {openRound.name} (Sprint {openRound.sprint}) — {analytics?.submittedCount ?? 0} of{" "}
                {analytics?.totalStudents ?? 0} students have submitted.
              </>
            ) : (
              <>
                No round is currently open.{" "}
                <Link className="underline" href="/professor/rounds">
                  Open one from Rounds.
                </Link>
              </>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unresolved alerts.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Badge variant={a.severity === "CRITICAL" ? "destructive" : "secondary"}>
                    {a.type.replaceAll("_", " ")}
                  </Badge>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

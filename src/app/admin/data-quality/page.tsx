import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { matches, seasons } from "@/lib/schema";

export const dynamic = "force-dynamic";

type IssueTone = "error" | "warning";

interface MatchIssue {
  id: number;
  week: number;
  division: string;
  matchup: string;
  issues: Array<{ label: string; tone: IssueTone }>;
}

const issueClasses: Record<IssueTone, string> = {
  error: "border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)]",
  warning: "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
};

export default async function DataQualityPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");

  const currentSeason = await db.query.seasons.findFirst({
    where: eq(seasons.isCurrent, true),
    columns: { id: true, name: true },
  });

  if (!currentSeason) {
    return (
      <Card>
        <CardHeader><CardTitle>Data Quality</CardTitle></CardHeader>
        <CardContent>No current season is configured.</CardContent>
      </Card>
    );
  }

  const seasonMatches = await db.query.matches.findMany({
    where: eq(matches.seasonId, currentSeason.id),
    columns: {
      id: true,
      week: true,
      coach1SeasonId: true,
      coach2SeasonId: true,
      winnerId: true,
      isForfeit: true,
      replayUrl: true,
      decidingTurnsText: true,
    },
    with: {
      division: { columns: { name: true } },
      coach1: { columns: { teamName: true } },
      coach2: { columns: { teamName: true } },
      matchPokemon: { columns: { id: true } },
    },
    orderBy: [asc(matches.week), asc(matches.id)],
  });

  const regularMatches = seasonMatches.filter((match) => match.week <= 100);
  const completedMatches = regularMatches.filter((match) => match.winnerId !== null);
  const completedNonForfeit = completedMatches.filter((match) => !match.isForfeit);
  const missingDecidingTurns = completedNonForfeit.filter((match) => !match.decidingTurnsText?.trim()).length;
  const missingReplays = completedNonForfeit.filter((match) => !match.replayUrl?.trim()).length;
  const missingPokemon = completedMatches.filter((match) => match.matchPokemon.length === 0).length;

  const issues: MatchIssue[] = regularMatches.flatMap((match) => {
    const matchIssues: MatchIssue["issues"] = [];
    const isCompleted = match.winnerId !== null;

    if (isCompleted && match.winnerId !== match.coach1SeasonId && match.winnerId !== match.coach2SeasonId) {
      matchIssues.push({ label: "Invalid winner", tone: "error" });
    }
    if (isCompleted && !match.isForfeit && !match.decidingTurnsText?.trim()) {
      matchIssues.push({ label: "Missing deciding turns", tone: "warning" });
    }
    if (isCompleted && !match.isForfeit && !match.replayUrl?.trim()) {
      matchIssues.push({ label: "Missing replay", tone: "warning" });
    }
    if (isCompleted && match.matchPokemon.length === 0) {
      matchIssues.push({ label: "Missing Pokémon stats", tone: "error" });
    }
    if (matchIssues.length === 0) return [];

    return [{
      id: match.id,
      week: match.week,
      division: match.division?.name ?? "Unknown division",
      matchup: `${match.coach1?.teamName ?? "TBD"} vs ${match.coach2?.teamName ?? "TBD"}`,
      issues: matchIssues,
    }];
  });

  const weekSummaries = Array.from(new Set(regularMatches.map((match) => match.week))).map((week) => {
    const weekMatches = regularMatches.filter((match) => match.week === week);
    const completed = weekMatches.filter((match) => match.winnerId !== null);
    const completeRecords = completed.filter((match) => match.isForfeit || (
      Boolean(match.replayUrl?.trim()) &&
      Boolean(match.decidingTurnsText?.trim()) &&
      match.matchPokemon.length > 0
    ));
    return { week, total: weekMatches.length, completed: completed.length, documented: completeRecords.length };
  });

  const summaryCards = [
    ["Open issues", issues.length, "matches needing review"],
    ["Deciding turns", missingDecidingTurns, "completed matches missing notes"],
    ["Replay links", missingReplays, "completed matches missing replays"],
    ["Pokémon stats", missingPokemon, "completed matches missing stat rows"],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">{currentSeason.name}</p>
          <h1 className="text-3xl font-bold text-white">Data Quality</h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">Current-season match completeness in one review queue.</p>
        </div>
        <Link href="/admin/matches"><Button variant="outline">Manage Matches</Button></Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, value, detail]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">{label}</p>
              <p className="mt-2 text-3xl font-bold text-white">{value}</p>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Week-by-week completeness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {weekSummaries.map((week) => (
              <div key={week.week} className="rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">Week {week.week}</p>
                  <span className="text-xs text-[var(--foreground-muted)]">{week.completed}/{week.total} played</span>
                </div>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">{week.documented}/{week.completed} completed records fully documented</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">Open a match to fill the missing fields or correct its result.</p>
        </CardHeader>
        <CardContent>
          {issues.length === 0 ? (
            <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 p-5 text-[var(--success)]">
              All current-season match records pass these completeness checks.
            </div>
          ) : (
            <div className="space-y-3">
              {issues.map((match) => (
                <Link key={match.id} href={`/matches/${match.id}`} className="block rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-4 transition-colors hover:border-[var(--primary)]/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">{match.matchup}</p>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">{match.division} · Week {match.week} · Match #{match.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {match.issues.map((issue) => (
                        <span key={issue.label} className={`rounded-full border px-2 py-1 text-xs font-medium ${issueClasses[issue.tone]}`}>
                          {issue.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

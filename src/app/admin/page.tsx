import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  adminAuditLogs,
  matches,
  pickEmParticipants,
  playoffMatches,
  seasons,
  transactions,
} from "@/lib/schema";
import { getPublicVisibilityState } from "@/lib/public-visibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfinityReleaseCard } from "@/components/admin/infinity-release-card";
import { ensureAdminAuditLogsTable } from "@/lib/admin-audit";

type Tone = "success" | "warning" | "error" | "muted" | "info";

const toneClasses: Record<Tone, string> = {
  success: "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  warning: "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
  error: "border-[var(--error)]/30 bg-[var(--error)]/10 text-[var(--error)]",
  muted: "border-[var(--card-border)] bg-[var(--background-secondary)] text-[var(--foreground-muted)]",
  info: "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]",
};

const season11Checklist = [
  {
    title: "League Setup",
    items: [
      "Create the Season 11 record and divisions.",
      "Add teams as season coaches using the correct persistent coach account.",
      "Confirm team names, abbreviations, logos, divisions, and replacement links.",
      "Confirm Season 11 is marked current only when launch data is ready.",
    ],
  },
  {
    title: "ELO",
    items: [
      "Verify dynamic placement ELO for each Season 11 division.",
      "Exclude new placements from each division average.",
      "Spot-check average minus 100, rounded to the nearest 25.",
      "Run a full ELO recalculation on a copied database before production recalculation.",
    ],
  },
  {
    title: "Draft And Rosters",
    items: [
      "Import Season 11 Pokemon prices, bans, tera bans, and tera captain costs.",
      "Create initial rosters using Season 11 season_coaches IDs.",
      "Check roster limits, remaining budget, and tera captains.",
      "Confirm free agent pools are division-specific.",
    ],
  },
  {
    title: "Schedule And Results",
    items: [
      "Import Season 11 schedule with correct season, division, and season coach IDs.",
      "Check week numbers, dates, playoff weeks, and Game of the Week flags.",
      "Test replay parser and match report output on a Season 11 match.",
      "Confirm turns logic and updated report format apply only Season 11 onward.",
    ],
  },
  {
    title: "Betting And Pick-Ems",
    items: [
      "Confirm Season 11 pick-em participants and settings.",
      "Verify winner, kill, and death betting use Season 11 matches and rosters.",
      "Test one local match result settlement for bets, coins, and pick-em rewards.",
    ],
  },
  {
    title: "Pre-Launch Verification",
    items: [
      "Run TypeScript, targeted ESLint, and production build.",
      "Back up production DB before imports, migrations, or recalculations.",
      "Browse public pages and admin pages after deploy.",
      "Check /api/health, blog, divisions, rosters, schedule, and admin matches.",
    ],
  },
];

function StatusChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  tone: Tone;
}) {
  return (
    <Link href={href} className="block rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-4 transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--background-tertiary)]/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">{detail}</p>
        </div>
        <StatusChip tone={tone}>{tone === "success" ? "OK" : tone === "error" ? "Risk" : tone === "warning" ? "Check" : "Info"}</StatusChip>
      </div>
    </Link>
  );
}

function formatAge(iso: string | null | undefined) {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function getDashboardData() {
  await ensureAdminAuditLogsTable();

  const currentSeason = await db.query.seasons.findFirst({
    where: eq(seasons.isCurrent, true),
    with: { divisions: true },
  });

  if (!currentSeason) {
    const [visibility, recentAudit] = await Promise.all([
      getPublicVisibilityState(),
      db.query.adminAuditLogs.findMany({
        orderBy: [desc(adminAuditLogs.createdAt)],
        limit: 5,
      }),
    ]);

    return { currentSeason: null, visibility, recentAudit };
  }

  const divisionIds = currentSeason.divisions.map((division) => division.id);

  const [
    seasonTeams,
    seasonMatches,
    seasonTransactions,
    seasonPlayoffs,
    sheetConfigs,
    pickEmRows,
    recentAudit,
    visibility,
  ] = await Promise.all([
    db.query.seasonCoaches.findMany({
      where: (table, { inArray }) => inArray(table.divisionId, divisionIds),
      with: { rosters: true },
    }),
    db.query.matches.findMany({
      where: eq(matches.seasonId, currentSeason.id),
      with: { matchPokemon: true },
    }),
    db.query.transactions.findMany({
      where: eq(transactions.seasonId, currentSeason.id),
      orderBy: [desc(transactions.createdAt)],
    }),
    db.query.playoffMatches.findMany({
      where: eq(playoffMatches.seasonId, currentSeason.id),
    }),
    db.query.divisionSheetSync.findMany({
      where: (table, { inArray }) => inArray(table.divisionId, divisionIds),
    }),
    db.query.pickEmParticipants.findMany({
      where: eq(pickEmParticipants.seasonId, currentSeason.id),
    }),
    db.query.adminAuditLogs.findMany({
      orderBy: [desc(adminAuditLogs.createdAt)],
      limit: 5,
    }),
    getPublicVisibilityState(),
  ]);

  const regularMatches = seasonMatches.filter((match) => match.week <= 100);
  const pendingMatches = regularMatches.filter((match) => !match.winnerId);
  const completedMatches = regularMatches.filter((match) => match.winnerId);
  const completedMissingPokemon = completedMatches.filter((match) => match.matchPokemon.length === 0);
  const currentWeek = regularMatches.length > 0
    ? Math.min(...pendingMatches.map((match) => match.week), Math.max(...regularMatches.map((match) => match.week)))
    : null;
  const currentWeekPending = currentWeek
    ? pendingMatches.filter((match) => match.week === currentWeek).length
    : 0;
  const incompleteRosterTeams = seasonTeams.filter((team) => team.rosters.length < 10);
  const teamsWithoutLogos = seasonTeams.filter((team) => !team.teamLogoUrl);
  const recentTransactions = seasonTransactions.filter((tx) => {
    const createdAt = tx.createdAt ? new Date(tx.createdAt).getTime() : 0;
    return Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
  });
  const failedSheets = sheetConfigs.filter((config) => config.lastSyncStatus === "error");
  const staleSheets = sheetConfigs.filter((config) => {
    if (!config.syncEnabled) return false;
    if (!config.lastSyncAt) return true;
    return Date.now() - new Date(config.lastSyncAt).getTime() > 48 * 60 * 60 * 1000;
  });
  const hiddenSchedules = currentSeason.isSchedulePublic === false ? currentSeason.divisions.length : 0;
  const hiddenDivisions = currentSeason.divisions.filter((division) =>
    visibility.hiddenDivisionNames.has(division.name.toLowerCase())
  );
  const bracketSlotsWithOneTeam = seasonPlayoffs.filter((match) =>
    Boolean(match.higherSeedId) !== Boolean(match.lowerSeedId)
  );
  const playoffResultsWithoutMatch = seasonPlayoffs.filter((match) => match.winnerId && !match.matchId);
  const auditChangesToday = recentAudit.filter((entry) =>
    Date.now() - new Date(entry.createdAt).getTime() <= 24 * 60 * 60 * 1000
  ).length;

  return {
    currentSeason,
    visibility,
    recentAudit,
    stats: {
      teamCount: seasonTeams.length,
      divisionCount: currentSeason.divisions.length,
      currentWeek,
      pendingMatches: pendingMatches.length,
      currentWeekPending,
      completedMissingPokemon: completedMissingPokemon.length,
      incompleteRosterTeams: incompleteRosterTeams.length,
      teamsWithoutLogos: teamsWithoutLogos.length,
      recentTransactions: recentTransactions.length,
      sheetConfigCount: sheetConfigs.length,
      failedSheets: failedSheets.length,
      staleSheets: staleSheets.length,
      hiddenSchedules,
      hiddenDivisions: hiddenDivisions.length,
      pickEmParticipants: pickEmRows.length,
      bracketSlotsWithOneTeam: bracketSlotsWithOneTeam.length,
      playoffResultsWithoutMatch: playoffResultsWithoutMatch.length,
      auditChangesToday,
      latestAuditAt: recentAudit[0]?.createdAt ?? null,
      latestSheetSyncAt: sheetConfigs
        .map((config) => config.lastSyncAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    },
  };
}

export default async function AdminDashboard() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    redirect("/admin/login");
  }

  const dashboard = await getDashboardData();

  if (!dashboard.currentSeason) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-[var(--foreground-muted)]">No current season is configured.</p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-semibold">Create or mark a current season</p>
              <p className="text-sm text-[var(--foreground-muted)]">Most dashboard metrics are current-season scoped.</p>
            </div>
            <Link href="/admin/seasons">
              <Button size="sm">Manage Seasons</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { currentSeason, stats, recentAudit, visibility } = dashboard;
  const actionQueue = [
    stats.pendingMatches > 0 && {
      label: "Enter pending match results",
      detail: `${stats.pendingMatches} regular season match${stats.pendingMatches === 1 ? "" : "es"} need results`,
      href: "/admin/matches",
      tone: "warning" as Tone,
    },
    stats.completedMissingPokemon > 0 && {
      label: "Fill missing match Pokemon",
      detail: `${stats.completedMissingPokemon} completed match${stats.completedMissingPokemon === 1 ? "" : "es"} have no Pokemon stat rows`,
      href: "/admin/matches",
      tone: "error" as Tone,
    },
    stats.incompleteRosterTeams > 0 && {
      label: "Complete rosters",
      detail: `${stats.incompleteRosterTeams} team${stats.incompleteRosterTeams === 1 ? "" : "s"} have fewer than 10 roster entries`,
      href: "/admin/rosters",
      tone: "warning" as Tone,
    },
    stats.failedSheets > 0 && {
      label: "Fix failed Sheets sync",
      detail: `${stats.failedSheets} configured division${stats.failedSheets === 1 ? "" : "s"} have sync errors`,
      href: "/admin/sheets",
      tone: "error" as Tone,
    },
    stats.staleSheets > 0 && {
      label: "Refresh stale Sheets sync",
      detail: `${stats.staleSheets} enabled sheet sync${stats.staleSheets === 1 ? "" : "s"} are stale or never synced`,
      href: "/admin/sheets",
      tone: "warning" as Tone,
    },
    stats.bracketSlotsWithOneTeam > 0 && {
      label: "Finish playoff bracket slots",
      detail: `${stats.bracketSlotsWithOneTeam} playoff slot${stats.bracketSlotsWithOneTeam === 1 ? "" : "s"} have only one team assigned`,
      href: "/admin/matches",
      tone: "warning" as Tone,
    },
    stats.hiddenSchedules > 0 && {
      label: "Review schedule visibility",
      detail: "The current season schedule is hidden from public division pages",
      href: "/admin/matches",
      tone: "info" as Tone,
    },
  ].filter(Boolean) as Array<{ label: string; detail: string; href: string; tone: Tone }>;

  const healthChips = [
    { label: "DB OK", tone: "success" as Tone },
    { label: `${stats.sheetConfigCount} sheet config${stats.sheetConfigCount === 1 ? "" : "s"}`, tone: stats.failedSheets > 0 ? "error" as Tone : stats.staleSheets > 0 ? "warning" as Tone : "success" as Tone },
    { label: currentSeason.isPublic === false ? "Season private" : "Season public", tone: currentSeason.isPublic === false ? "warning" as Tone : "success" as Tone },
    { label: currentSeason.isSchedulePublic === false ? "Schedule hidden" : "Schedule public", tone: currentSeason.isSchedulePublic === false ? "warning" as Tone : "success" as Tone },
    { label: visibility.infinityDivisionReleased ? "Infinity visible" : "Infinity hidden", tone: visibility.infinityDivisionReleased ? "success" as Tone : "info" as Tone },
    { label: `Audit ${formatAge(stats.latestAuditAt)}`, tone: stats.latestAuditAt ? "success" as Tone : "muted" as Tone },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-[var(--foreground-muted)]">
            Current-season operations for {currentSeason.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {healthChips.map((chip) => (
            <StatusChip key={chip.label} tone={chip.tone}>{chip.label}</StatusChip>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">Current Season</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xl font-bold text-white">{currentSeason.name}</p>
                <StatusChip tone="info">Week {stats.currentWeek ?? "N/A"}</StatusChip>
                <StatusChip tone="muted">{stats.divisionCount} divisions</StatusChip>
                <StatusChip tone="muted">{stats.teamCount} teams</StatusChip>
                <StatusChip tone="muted">Budget {currentSeason.draftBudget} pts</StatusChip>
              </div>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Latest sheet sync: {formatAge(stats.latestSheetSyncAt)} · Recent transactions: {stats.recentTransactions} this week
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/matches"><Button size="sm">Enter Result</Button></Link>
              <Link href="/admin/transactions"><Button size="sm" variant="outline">Add Transaction</Button></Link>
              <Link href="/admin/sheets"><Button size="sm" variant="outline">Sync Sheets</Button></Link>
              <Link href="/admin/audit-log"><Button size="sm" variant="outline">Audit Log</Button></Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Matches"
          value={stats.pendingMatches}
          detail={`${stats.currentWeekPending} pending in current week`}
          href="/admin/matches"
          tone={stats.pendingMatches > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Rosters"
          value={stats.incompleteRosterTeams}
          detail={`${stats.teamsWithoutLogos} teams missing logos`}
          href="/admin/rosters"
          tone={stats.incompleteRosterTeams > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Sheets"
          value={stats.failedSheets}
          detail={`${stats.staleSheets} stale or never synced`}
          href="/admin/sheets"
          tone={stats.failedSheets > 0 ? "error" : stats.staleSheets > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Audit"
          value={stats.auditChangesToday}
          detail="risky changes in last 24h"
          href="/admin/audit-log"
          tone={stats.auditChangesToday > 0 ? "info" : "muted"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Action Queue</CardTitle>
            <p className="text-sm text-[var(--foreground-muted)]">Only items that need admin attention appear here.</p>
          </CardHeader>
          <CardContent>
            {actionQueue.length === 0 ? (
              <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 p-4">
                <p className="font-semibold text-[var(--success)]">No urgent admin actions</p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">Current-season data looks clean from the dashboard checks.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {actionQueue.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-start justify-between gap-4 rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3 transition-colors hover:border-[var(--primary)]/50"
                  >
                    <div>
                      <p className="font-semibold text-white">{item.label}</p>
                      <p className="text-sm text-[var(--foreground-muted)]">{item.detail}</p>
                    </div>
                    <StatusChip tone={item.tone}>{item.tone === "error" ? "Fix" : "Open"}</StatusChip>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Recent Admin Activity</CardTitle>
                <p className="text-sm text-[var(--foreground-muted)]">Last risky writes recorded in the audit log.</p>
              </div>
              <Link href="/admin/audit-log">
                <Button size="sm" variant="outline">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--foreground-muted)]">No audit entries yet.</p>
            ) : (
              <div className="space-y-3">
                {recentAudit.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{entry.summary}</p>
                        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                          {entry.actorName || "Unknown"} · {entry.action}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-[var(--foreground-muted)]">{formatAge(entry.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Shortcuts</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">Current-season landing zones for the most common admin flows.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Upload schedule", "/admin/matches", `${stats.pendingMatches} pending matches`],
              ["Enter match result", "/admin/matches", `${stats.completedMissingPokemon} results missing Pokemon rows`],
              ["Manage current rosters", "/admin/rosters", `${stats.incompleteRosterTeams} incomplete teams`],
              ["Add transaction", "/admin/transactions", `${stats.recentTransactions} transactions this week`],
              ["Sync sheets", "/admin/sheets", `${stats.failedSheets} failed, ${stats.staleSheets} stale`],
              ["Manage engagement", "/admin/engagement", `${stats.pickEmParticipants} pick-em participants`],
            ].map(([label, href, detail]) => (
              <Link key={label} href={href} className="rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3 transition-colors hover:border-[var(--primary)]/50">
                <p className="font-semibold text-white">{label}</p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">{detail}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operational Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: "Pokemon rows",
                value: stats.completedMissingPokemon,
                detail: "completed matches without match Pokemon",
                tone: stats.completedMissingPokemon > 0 ? "error" as Tone : "success" as Tone,
              },
              {
                label: "Playoff links",
                value: stats.playoffResultsWithoutMatch,
                detail: "playoff results without linked match rows",
                tone: stats.playoffResultsWithoutMatch > 0 ? "error" as Tone : "success" as Tone,
              },
              {
                label: "Hidden divisions",
                value: stats.hiddenDivisions,
                detail: "current-season divisions hidden publicly",
                tone: stats.hiddenDivisions > 0 ? "info" as Tone : "success" as Tone,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--card-border)] bg-[var(--background-secondary)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="text-sm text-[var(--foreground-muted)]">{item.value} {item.detail}</p>
                  </div>
                  <StatusChip tone={item.tone}>{item.value === 0 ? "OK" : "Review"}</StatusChip>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibility Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <InfinityReleaseCard
            initialState={{
              revealAt: visibility.infinityDivisionRevealAt.toISOString(),
              isReleased: visibility.infinityDivisionReleased,
              isManuallyReleased: visibility.infinityDivisionManuallyReleased,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Season Setup Checklist</CardTitle>
          <p className="text-sm text-[var(--foreground-muted)]">Secondary checklist for launch or major season setup work.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {season11Checklist.map((section) => (
              <div key={section.title} className="rounded-lg bg-[var(--background-secondary)] p-3">
                <p className="text-sm font-semibold text-white">{section.title}</p>
                <div className="mt-3 space-y-2">
                  {section.items.map((item) => (
                    <label key={item} className="flex items-start gap-2 text-sm text-[var(--foreground-muted)]">
                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-[var(--background-tertiary)] accent-[var(--primary)]" />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

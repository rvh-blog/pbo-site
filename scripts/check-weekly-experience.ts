import assert from "node:assert/strict";
import { leagueHref, positiveId } from "../src/lib/league-context";
import { getUnlockedPickWeeks, isMatchOpenForPicks } from "../src/lib/pick-em-availability";

const context = { seasonId: 42, divisionId: 90, week: 3, teamId: 701, matchId: 999 };
const params = (href: string) => new URL(href, "https://pbo.invalid").searchParams;
assert.equal(params(leagueHref("/matchup-prep", context)).get("matchId"), "999");
assert.equal(params(leagueHref("/leaderboards/items", context)).get("seasonId"), "42");
assert.equal(params(leagueHref("/leaderboards/items", context)).get("season"), null);
assert.equal(params(leagueHref("/compare", context)).get("division"), "90");
assert.equal(params(leagueHref("/compare", context)).get("teamId"), "701");
assert.equal(params(leagueHref("/compare?season=5", context)).get("division"), null);
assert.equal(params(leagueHref("/compare?division=5", context)).get("season"), null);
assert.equal(leagueHref("/matchup-prep?matchId=5", context), "/matchup-prep?matchId=5");
assert.equal(params(leagueHref("/matchup-prep?week=4", context)).get("matchId"), null);
assert.equal(params(leagueHref("/matchup-prep?teamId=702", context)).get("matchId"), null);
assert.equal(leagueHref("/seasons/42/divisions/90#schedule", context), "/seasons/42/divisions/90?week=3&teamId=701#schedule");
assert.equal(leagueHref("/seasons/2/divisions/4", context), "/seasons/2/divisions/4");
assert.equal(leagueHref("https://example.com", context), "https://example.com");
assert.equal(positiveId("12oops"), undefined);
assert.equal(positiveId("-1"), undefined);
assert.equal(positiveId("9007199254740992"), undefined);

const pending = (week: number) => ({ week, winnerId: null, isForfeit: false, scheduledAt: null });
const matches = [
  { ...pending(1), isForfeit: true }, // A double forfeit is still a result.
  pending(2), pending(3), pending(101),
];
const unlocked = getUnlockedPickWeeks(matches);
assert.deepEqual([...unlocked], [1, 2]);
const now = Date.parse("2026-09-05T12:00:00Z");
assert.equal(isMatchOpenForPicks(pending(2), unlocked, now), true);
assert.equal(isMatchOpenForPicks(pending(3), unlocked, now), false);
assert.equal(isMatchOpenForPicks({ ...pending(2), scheduledAt: "2026-09-05T12:00:00Z" }, unlocked, now), false);
assert.equal(isMatchOpenForPicks({ ...pending(2), scheduledAt: "2026-09-05T12:01:00Z" }, unlocked, now), true);
assert.equal(isMatchOpenForPicks({ ...pending(2), isForfeit: true }, unlocked, now), false);
assert.equal(getUnlockedPickWeeks([...matches, { ...pending(3), winnerId: 12 }]).has(101), true);
console.log("Weekly experience: context mapping and pick availability checks passed.");

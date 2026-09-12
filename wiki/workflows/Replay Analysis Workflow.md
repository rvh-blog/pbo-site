# Replay Analysis Workflow

Replay parsing extracts stats from Pokemon Showdown replay logs.

## Parser

- `src/app/api/replay-scrape/route.ts`

## Consumers

- Admin match result scraping.
- Discord bot match reporting.
- Wiglett match result supplemental stats.
- Public replay analyzer.

## Output

The parser returns:

- Replay tier.
- Player usernames.
- p1/p2 Pokemon stats.
- Winner.
- Remaining Pokemon counts.
- Replay start/end timestamps.
- Zoroark warning flag.
- Turn HP snapshots.
- Key faint/win events.
- Per-Pokemon held-item reveals with item, turn, and reveal source.

## PBO Match Recording

PBO match recording needs normalized Pokemon names so replay Pokemon match roster Pokemon reliably.

Default parser behavior should preserve existing PBO match recording behavior.

For Season 11, `[Gen 9 Champions] NatDex Draft` is treated as the PBO format.
That format preserves Mega form names during parsing, including names such as
`Barbaracle-Mega` and `Floette-Mega`, so replay analyzer output and downstream
matching can recognize the updated PokeAPI Pokemon records.

Showdown team preview and switch events can keep a drafted Mega in its base
form for the entire battle. Roster matching checks an exact base row first, then
uses generated Mega aliases so the base replay entry can populate the drafted
Mega row. The client-safe matcher is shared by admin replay review and the
server-side bot matching fallback. Regression coverage checks every stored Mega
form, including X/Y/Z and custom Champions variants; Floette-Eternal is handled
as the visible pre-Mega form for Floette-Mega.

Held-item usage is observational. The parser records explicit item events and
effects, while leaderboard aggregation excludes a Pokemon/item pairing revealed
only after that Pokemon received the item through Trick or Switcheroo. A berry
revealed because Knock Off removed it does not count as a successful berry use;
the berry counts only when another replay event shows it activating or being
consumed. Unrevealed items remain unknown unless the replay row is a
roster-confirmed Mega forme. In that case the matching Mega Stone is stored as
an explicitly labelled `assumed from team roster` evidence entry. A
non-transferred replay item that contradicts that stone is preserved and marks
the match for manual review.

## Historical Season 6 Backfill

`scripts/backfill-s6-replays.mjs` is the controlled importer for the Season 6
Neon, Sunset, and Stargazer replay archives. It matches each supplied replay to
an existing Season 6 fixture by both teams' stored rosters before writing replay
details. It is dry-run by default and requires `--apply` for database writes.

The importer uses the parser's current K/D attribution and rebuilds the
fixture's `kill_events` from the parser's faint events. A replay with an
unmatched roster, conflicting result or differential, incomplete roster
mapping, Zoroark/Illusion involvement, or historical K/D disagreement receives
`matches.needs_review = 1` and a reason in `matches.review_notes`. Missing
replay links are flagged only for non-forfeit fixtures.

Production execution must use a fresh WAL-aware backup and a controlled quiet
window. Never upload a stale local `pbo.db` over the Fly volume.

The deployed image includes bundled one-off maintenance commands under
`/app/dist/maintenance`. After confirming a fresh backup and pausing other
database writes, run the HAX backfill with `--apply` and the Mega item backfill
with `--season=11 --write`. Both commands require the explicit production
confirmation environment variables documented in [[Database Runbook]]. They
are not part of application startup and never run implicitly on every boot.

## Mega Item Backfill

`scripts/backfill-mega-items.mjs` is the all-season, dry-run-by-default repair
for saved replay rows whose historical roster identifies a Mega forme. It adds
the matching stone only when no contradictory item evidence exists and marks a
match for review when a non-transferred item conflicts. Use `--season=N` to
scope a run and `--write` only after the production backup/confirmation gate.

## Public Analyzer

The public analyzer can opt into display-focused behavior, such as preserving Mega forms, because it does not write to the database.

Current UI expectations:

- Coach stats should be wide enough to avoid horizontal scrolling on normal desktop layouts.
- Numeric coach stat values should align centered under their column names.
- Battle Timeline should appear underneath coach stats and above Key Events.

## Zoroark

Zoroark/Illusion can make replay attribution unreliable. The parser flags
`zoroarkInvolved`. Move commands are tracked per switch-in stint; when Illusion
breaks, commands from that stint are reassigned from the displayed disguise to
the revealed regular or Hisuian Zoroark. Earlier move usage belonging to the
real disguise target remains unchanged.

Audit all saved Season 9+ replay move maps without writing:

```bash
node scripts/backfill-replay-move-usage.mjs --all --quiet --report-changes
```

Add `--apply` only when running against a copied local database after reviewing
the reported changes. Add `--zoroark-only` to limit writes to replays where the
parser detects regular or Hisuian Zoroark.

## Risks

- Name normalization affects admin match recording, bot reporting, Wiglett, sheets, and public analyzer.
- p1/p2 must be mapped to actual teams before saving match stats.
- Hazards/status/weather attribution is complicated and easy to regress.
- Public analyzer changes should not change PBO match imports unless explicitly intended.
- Season/format-specific form preservation should be verified against bot and
  Wiglett match imports before release, because those paths share the replay
  parser.

## See Also

- [[Match Results Workflow]]
- [[Match Entities]]
- [[Change Guide]]

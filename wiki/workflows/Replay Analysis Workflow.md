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
consumed. Unrevealed items are never inferred.

## Public Analyzer

The public analyzer can opt into display-focused behavior, such as preserving Mega forms, because it does not write to the database.

Current UI expectations:

- Coach stats should be wide enough to avoid horizontal scrolling on normal desktop layouts.
- Numeric coach stat values should align centered under their column names.
- Battle Timeline should appear underneath coach stats and above Key Events.

## Zoroark

Zoroark/Illusion can make replay attribution unreliable. The parser flags `zoroarkInvolved`.

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

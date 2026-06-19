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

- Player usernames.
- p1/p2 Pokemon stats.
- Winner.
- Remaining Pokemon counts.
- Replay start/end timestamps.
- Zoroark warning flag.
- Turn HP snapshots.
- Key faint/win events.

## PBO Match Recording

PBO match recording needs normalized Pokemon names so replay Pokemon match roster Pokemon reliably.

Default parser behavior should preserve existing PBO match recording behavior.

## Public Analyzer

The public analyzer can opt into display-focused behavior, such as preserving Mega forms, because it does not write to the database.

## Zoroark

Zoroark/Illusion can make replay attribution unreliable. The parser flags `zoroarkInvolved`.

## Risks

- Name normalization affects admin match recording, bot reporting, Wiglett, sheets, and public analyzer.
- p1/p2 must be mapped to actual teams before saving match stats.
- Hazards/status/weather attribution is complicated and easy to regress.
- Public analyzer changes should not change PBO match imports unless explicitly intended.

## See Also

- [[Match Results Workflow]]
- [[Match Entities]]
- [[Change Guide]]

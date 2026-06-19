# Wiglett Workflow

Wiglett can submit draft picks and match results through webhooks.

## Routes

- `/api/integrations/wiglett/events`
- `/api/integrations/wiglett/draft-pick`
- `/api/integrations/wiglett/match-result`

Files:

- `src/app/api/integrations/wiglett`
- `src/lib/wiglett-integration.ts`

## Idempotency

`wiglett_events.eventId` is unique.

If the same successful `eventId` is submitted again, the stored result is returned rather than processing twice.

## Draft Pick Flow

Wiglett can identify a team by:

- `seasonCoachId`
- `teamName`
- `teamAbbreviation`
- `coachName`

Pokemon can be identified by:

- `pokemonId`
- `pokemonName`

Name aliases are normalized for common form differences.

## Match Result Flow

For non-forfeits, Wiglett should send Pokemon rows. The site validates submitted Pokemon against the team's PBO roster for the match week.

Wiglett K/D is canonical. Replay scrape only fills supplemental stats, timing, and key events.

## Security

Webhook requests use a shared secret header. Do not copy secrets into wiki pages. See local operational docs or platform secret stores for current values.

## See Also

- `docs/wiglett-handoff.md`
- [[Integration Entities]]
- [[Match Results Workflow]]

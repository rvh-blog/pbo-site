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

Pokemon names are resolved through `src/lib/pokemon-name-utils.ts`.

- Wiglett draft picks and match Pokemon should use
  `pokemonExactLookupKeys()` / `pokemonNormalizedLookupKeys()` to match external
  payload names against DB rows and rosters.
- If Wiglett sends a new alias or alternate spelling, update the central
  normalizer/lookup helpers in `pokemon-name-utils.ts`; do not add a
  Wiglett-specific name normalizer.
- For Pokemon that PBO drafts as separate forms, Wiglett should send a
  form-specific name or `pokemonId`. For example, plain `Urshifu` is ambiguous;
  use `Urshifu-Single-Strike`, `Urshifu-Rapid-Strike`, or an accepted equivalent
  such as `Single Strike Urshifu`.

## Match Result Flow

For non-forfeits, Wiglett should send Pokemon rows. The site validates submitted Pokemon against the team's PBO roster for the match week.

Wiglett K/D is canonical. Replay scrape only fills supplemental stats, timing, and key events.

## Security

Webhook requests use a shared secret header. Do not copy secrets into wiki pages. See local operational docs or platform secret stores for current values.

## See Also

- `docs/wiglett-handoff.md`
- [[Integration Entities]]
- [[Match Results Workflow]]

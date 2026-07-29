# Data Model

The source of truth is `src/lib/schema.ts`. This page documents the relationships and invariants that are easy to miss when making changes.

Parent index: [[Home|PBO Site Wiki]]

Related pages:

- [[Core League Entities]]
- [[Match Entities]]
- [[Roster And Transaction Entities]]
- [[Elo, Betting, And Pick-Em Entities]]
- [[Integration Entities]]

## Core Identity Model

### Persistent People

`coaches` is the persistent identity table.

Use `coaches.id` for:

- Global Elo (`coaches.eloRating`, `elo_history.coachId`).
- Coach login/account ownership.
- PBO coin balances.
- Store purchases.
- Long-term coach profile pages.

Do not use `coaches.id` when you mean "this team in this season/division."

### Teams In A Season

`season_coaches` is the team slot for a coach in one division.

Use `season_coaches.id` for:

- Rosters.
- Matches.
- Match Pokemon.
- Standings.
- Transactions.
- Bets and pick-em predicted winners.
- Kill/death bet team ownership.

A coach can have multiple `season_coaches` rows across seasons and can even appear in multiple divisions in one season. Treat `season_coaches.id` as the competitive team identity.

## League Hierarchy

```text
seasons
  -> divisions
    -> season_coaches
      -> rosters
      -> transactions
    -> matches
      -> match_pokemon
      -> kill_events
    -> playoff_matches
```

Key rules:

- A division belongs to one season.
- A season coach belongs to one division and inherits that division's season.
- A match's `seasonId`, `divisionId`, `coach1SeasonId`, `coach2SeasonId`, and `winnerId` must all agree.
- The DB enforces that referenced IDs exist, but it does not always enforce that they belong to the same match/division/season.

## Pokemon And Prices

`pokemon`, `moves`, and `abilities` are global reference data.

`pokemon.moves` is the default/global learnset data. Format-specific learnsets
belong in `season_pokemon_moves`, keyed by `season_id` and `pokemon_id`. Use
`src/lib/season-pokemon-moves.ts` when a page or API needs the moves legal for a
specific season.

Updating `season_pokemon_moves` for one season is separate from draft state.
It should not require touching rosters, transactions, matches, season coaches,
or season prices.

`season_pokemon_prices` is season-specific and links a Pokemon to:

- Draft/FA price.
- Tera ban flag.
- Tera captain cost.
- Complex ban reason.

`price = -1` means complex ban/unavailable for drafting logic.

### Pokemon Name Aliases And Collapses

Pokemon name normalization has two configurable tables:

- `pokemon_name_aliases`: accepted alternate spellings for one drafted Pokemon.
- `pokemon_name_collapses`: accepted source names that intentionally resolve to
  a target Pokemon row.

Aliases are for equivalent input names, such as an external tool sending
`Battle Bond Greninja` for the Pokemon row that should be considered Greninja in
PBO lookups. Collapses are for form behavior where incoming data should resolve
to a different target row, such as visual or battle-state forms that PBO does
not draft separately.

The hardcoded baseline still lives in `src/lib/pokemon-name-utils.ts`.
Admin-configured rows are loaded through `src/lib/pokemon-name-aliases.ts`.
Server integrations that accept external Pokemon names should use the
alias-aware lookup helpers, not direct string matching.

Roster rows store their own `price`. This matters because:

- A roster price may include Tera captain cost.
- Historical roster prices should not be inferred only from current season prices.
- Transaction undo/redo and budget calculations depend on stored roster price.

## Rosters And Transactions

`rosters` is the current roster state. Historical roster state is reconstructed from current roster plus `transactions`.

Transaction types:

- `FA_PICKUP`
- `FA_DROP`
- `FA_SWAP`
- `P2P_TRADE`
- `TERA_SWAP`

Important transaction fields:

- `seasonCoachId`: primary team.
- `tradingPartnerSeasonCoachId`: partner team for P2P trades.
- `pokemonIn` / `pokemonOut`: JSON arrays of `pokemon.id`; not DB foreign keys.
- `budgetChange`: signed budget change.
- `countsAgainstLimit`: whether it consumes FA/P2P action limits.
- `week`: active week for time-synced roster logic.

Critical rules:

- Free agent pools are division-specific, not season-wide.
- P2P trade has one transaction row from the primary team's perspective; partner perspective is inferred by swapping `pokemonIn` and `pokemonOut`.
- Tera captain price is folded into roster price.
- Tera swaps mutate roster `isTeraCaptain`, roster price, and `season_coaches.remainingBudget`.
- Transaction history powers time-synced rosters. Editing or deleting old transactions can change historical match prep, betting odds, sheet exports, and roster displays.

Time-synced roster utilities:

- `src/lib/roster-utils.ts`
- `src/lib/transaction-service.ts`
- `src/lib/sheets-roster-sync.ts`

## Matches And Result Cascades

`matches` stores schedule, result, replay, HP chart JSON, key event JSON, and Game of the Week flag.

`match_pokemon` stores per-match Pokemon brought, kills, deaths, and replay-derived stats.
Replay detail fields include direct/indirect damage dealt and taken, HP restored,
turns active, hazard-only damage taken, setup moves used, favorable event
counters for crits, misses, flinches, paralysis, freezes, and non-Will-O-Wisp
burns, plus `revealed_items` JSON entries containing an item, reveal turn, and
source. The base replay-detail fields require
`migrations/add-match-pokemon-replay-detail-stats.sql`; revealed item storage
requires `migrations/add-revealed-held-items.sql` on existing databases.

`revealed_items` is evidence from the public replay log, not a complete team
sheet. An unrevealed starting item remains unknown. The same item is stored once
per Pokemon per match even if it activates repeatedly. If Trick, Switcheroo, or
another effect makes multiple distinct items observable on one Pokemon, each
distinct item can be stored. Historical item aggregation starts at Season 5
because earlier seasons do not have saved replay links. Use
`scripts/backfill-revealed-items.mjs --dry-run` to audit replay matching before
running the backfill against a database.

`kill_events` stores individual replay-derived faint events.

When a result is created or edited via `src/app/api/matches/route.ts`, the route can touch:

- `matches`
- `match_pokemon`
- `kill_events`
- `elo_history`
- `coaches.eloRating`
- `coaches.pboCoin` / `users.pboCoin`
- `bets`
- `kill_bets`
- `death_bets`
- `pick_em_rewards`

Result entry cascade:

1. Write match result fields.
2. Replace or insert match Pokemon.
3. Insert or replace kill events from replay key events.
4. Update Elo if possible.
5. Award match coins.
6. Resolve or refund winner bets, kill bets, and death bets.
7. Award or re-resolve pick-em rewards.
8. Award or reverse/reaward GOTW bonuses.

Most of this is not wrapped in one database transaction. Be careful adding failure points in the middle of this flow.

## Replay Parsing

Replay parser:

- `src/app/api/replay-scrape/route.ts`

Consumers:

- Admin match entry.
- Discord bot match reporting.
- Wiglett match integration for supplemental stats.
- Replay Analyzer, match summaries, Item Usage, Pokemon Stats, coach profiles,
  Matchup Prep scouting, and admin match review for revealed item data.
- Public analyzer page.

Important distinction:

- PBO match recording normalizes Pokemon names to roster species for matching.
- Public analyzer may preserve display forms when explicitly requested.

Zoroark/Illusion games are flagged because replay attribution can be unreliable.

## Playoffs

`playoff_matches` stores bracket metadata. Playoff games can also be represented in `matches`, with week numbers:

- `101`: Quarterfinals
- `102`: Semifinals
- `103`: Finals

Do not double-count playoff matches by joining both `playoff_matches` and `matches` as separate completed games.

## Standings

Shared standings sort logic is in `src/lib/standings-sort.ts`.

Sort order:

1. Wins.
2. Differential.
3. Fewer losses.
4. Head-to-head.
5. Strength of schedule.

Replacement coaches are soft-linked through `season_coaches.replacedById`. Standings can resolve predecessor IDs into the active team record.

## Elo

Elo formula:

```text
expectedScore = 1 / (1 + 3 ^ ((opponentElo - ownElo) / 400))
newElo = currentElo + 100 * (actualScore - expectedScore)
```

Rules:

- Normal win/loss: `1` / `0`.
- Forfeit win/loss: `0.75` / `0.25`.
- Double forfeit: both receive `0.25`.
- Forfeits enforce a minimum 15 point swing/loss.
- Ratings are rounded to 2 decimals.

Files:

- `src/lib/elo.ts`
- `src/lib/elo-service.ts`
- `src/lib/recalculate-elo.ts`

`coaches.eloRating` is the current snapshot. `elo_history` is the audit trail. Full recalculation clears and rebuilds `elo_history`.

## Betting, Pick-Ems, And Currency

Currency lives on both:

- `coaches.pboCoin`
- `users.pboCoin`

Coach users and spectator users are modeled separately. Many tables use nullable `coachId` / `userId` pairs.

Bet tables:

- `bets`: match winner bets.
- `kill_bets`: Pokemon kill threshold bets.
- `death_bets`: Pokemon dies/survives bets.

Pick-em tables:

- `pick_em_participants`
- `pick_em_picks`
- `pick_em_rewards`

Important rules:

- Pending bets do not escrow/deduct coins at placement time.
- Settlement moves coins when a result is recorded.
- Forfeits refund bets.
- Kill/death bet settlement depends on accurate `match_pokemon`.
- Pokemon not brought means 0 kills for kill bets and loss for both death bet types.
- Pick-em rewards are tracked in `pick_em_rewards`; re-resolution reverses coins and deletes/recreates reward rows.
- Fantasy rewards are tracked in `fantasy_rewards`; weekly re-resolution reverses existing rewards before recalculating placement payouts.

## League Polls

Site-wide homepage/profile polls use:

- `polls`: one admin-authored question, JSON option list, and active flag.
- `poll_votes`: one vote per coach per poll.

The active poll is managed from the admin home page and rendered in the home
page Your League box plus coach profile pages. Coach users can vote once per
poll and see results after voting. Users who have not voted should not see
results. Spectators and logged-out visitors can see the poll prompt but cannot
vote.

Poll cards can be hidden client-side by the viewer through local storage. The
hide preference is per poll and is not league data.

## Blog

Blog content uses:

- `blog_posts`
- `blog_comments`

`blog_posts.isPublished` is also the moderation state: admin posts are created as
published, while coach posts remain unpublished until an admin approves them.
Pending posts are visible only to admins and their author. The legacy
`coaches.canPostBlog` column is no longer used. Blog comments may reference a
parent comment for replies.

## Admin Audit Logs

Admin audit entries use `admin_audit_logs`. The audit helper can create the table and indexes at runtime if they are missing.

## Sheets And External Integrations

`division_sheet_sync` config is unique per division.

Wiglett audit/idempotency lives in `wiglett_events`.

Pokemon name aliases live in `pokemon_name_aliases`.

- `pokemon_id` points to `pokemon.id`.
- `alias` is the admin-entered accepted spelling.
- `alias_key` is the normalized unique lookup key produced from the alias.

Use Admin -> Pokemon -> Name Normalizer Aliases to manage these records. Server
flows that need admin aliases should use `src/lib/pokemon-name-aliases.ts`
rather than creating local alias maps.

Pokemon name collapses live in `pokemon_name_collapses`.

- `target_pokemon_id` points to the Pokemon that incoming names should normalize
  to.
- `source_name` is the incoming form/name to collapse.
- `source_key` is the unique normalized lookup key for the source.

Use Admin -> Pokemon -> Custom collapses when a form appearing in replays,
Wiglett, or sheet data should intentionally point to one PBO Pokemon.

Wiglett endpoints:

- `/api/integrations/wiglett/events`
- `/api/integrations/wiglett/draft-pick`
- `/api/integrations/wiglett/match-result`

See `docs/wiglett-handoff.md` for payloads, but do not copy secrets into new docs.

## Links That Are Not Fully DB-Enforced

These are real application links but weakly enforced by SQLite schema:

- `transactions.pokemonIn` / `pokemonOut` JSON arrays contain `pokemon.id`.
- `matches.turnSnapshots` and `matches.keyEvents` are serialized JSON strings.
- `rosters.acquiredTransactionId` points to `transactions.id`.
- `season_coaches.replacedById` points to another `season_coaches.id`.
- `winnerId` and predicted winner IDs should be one of a match's two teams.
- Kill/death bet Pokemon should belong to the team at that match week.
- Sheet sync finds teams/Pokemon by names, abbreviations, and sheet mapping.

Manual DB edits must account for these conventions.

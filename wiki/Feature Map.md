# Feature Map

This page maps major app features to their files.

Parent index: [[Home|PBO Site Wiki]]

See also:

- [[Project Overview]]
- [[Codebase Layout]]
- [[Glossary]]

## Framework

- Next.js app routes: `src/app`
- Shared components: `src/components`
- Database client: `src/lib/db.ts`
- Schema: `src/lib/schema.ts`
- Global styles: `src/app/globals.css`
- Navigation: `src/components/navigation.tsx`

## Public Pages

- Home: `src/app/page.tsx`
- Seasons: `src/app/seasons`
- Division page: `src/app/seasons/[id]/divisions/[divId]/page.tsx`
- Match details: `src/app/matches/[id]/page.tsx`
- Coaches: `src/app/coaches`
- Leaderboards: `src/app/leaderboards`
- Draft planner: `src/app/draft-planner`
- Matchup prep: `src/app/matchup-prep`
- Pick-ems: `src/app/pick-ems`
- Fantasy: `src/app/fantasy`
- Power rankings: `src/app/power-rankings`
- Broadcast overlay: `src/app/broadcast`
- Replay analyzer: `src/app/analyzer`
- Blog: `src/app/blog`
- Elo tracker: `src/app/elo-tracker`
- Pokemon stats: `src/app/pokemon/stats`

Feature notes:

- [[Draft Planner]]
- [[Fantasy]]
- [[Store And Cosmetics]]
- [[Blog]]
- [[Public Tools And Stats]]

## Admin

- Admin home: `src/app/admin/page.tsx`
- Admin layout/auth: `src/app/admin/layout.tsx`
- Seasons: `src/app/admin/seasons/page.tsx`
- Coaches: `src/app/admin/coaches/page.tsx`
- Rosters: `src/app/admin/rosters/page.tsx`
- Matches: `src/app/admin/matches/page.tsx`
- Transactions: `src/app/admin/transactions/page.tsx`
- Sheets: `src/app/admin/sheets/page.tsx`
- Users: `src/app/admin/users`
- Discord config: `src/app/admin/discord`
- Pick-ems admin: `src/app/admin/pick-ems`
- Engagement admin: `src/app/admin/engagement`
- Admin audit log: `src/app/admin/audit-log`

Admin notes:

- [[Admin And Engagement]]

## API Routes

- Matches: `src/app/api/matches/route.ts`
- Replay scrape: `src/app/api/replay-scrape/route.ts`
- Seasons: `src/app/api/seasons/route.ts`
- Divisions: `src/app/api/divisions`
- Rosters: `src/app/api/rosters/route.ts`
- Transactions: `src/app/api/transactions/route.ts`
- Standings: `src/app/api/standings/route.ts`
- Elo: `src/app/api/elo/route.ts`
- Auth: `src/app/api/auth`
- Store: `src/app/api/store`
- Betting: `src/app/api/bets`, `src/app/api/kill-bets`, `src/app/api/death-bets`
- Pick-ems: `src/app/api/pick-ems`
- Fantasy entries: `src/app/api/fantasy-entry`
- Blog: `src/app/api/blog`, `src/app/api/blog/comments`
- Preferences: `src/app/api/preferences`
- Search/export/health: `src/app/api/search`, `src/app/api/export`, `src/app/api/health`
- Broadcast: `src/app/api/broadcast`
- Wiglett: `src/app/api/integrations/wiglett`

## Core Services

- Elo formula: `src/lib/elo.ts`
- Elo processing/recalc: `src/lib/elo-service.ts`, `src/lib/recalculate-elo.ts`
- Standings sort: `src/lib/standings-sort.ts`
- Transactions: `src/lib/transaction-service.ts`
- Time-synced rosters: `src/lib/roster-utils.ts`
- Betting: `src/lib/betting.ts`
- Kill betting: `src/lib/kill-betting.ts`
- Death betting: `src/lib/death-betting.ts`
- Bet re-resolution: `src/lib/bet-resolution.ts`
- Pick-em rewards: `src/lib/pick-em-rewards.ts`
- Sheets sync: `src/lib/sheets-sync-all.ts`
- Wiglett integration: `src/lib/wiglett-integration.ts`
- Pokemon name normalization: `src/lib/pokemon-name-utils.ts`
- Damage calc helpers: `src/lib/damage-calc.ts`
- Session/auth helpers: `src/lib/session.ts`, `src/lib/auth.ts`

## Discord Bot

- Bot entry: `src/bot/index.ts`
- Commands: `src/bot/commands`
- Handlers: `src/bot/handlers`
- Match service: `src/bot/services/match-service.ts`
- Stats service: `src/bot/services/stats-service.ts`
- Build script: `scripts/build-bot.js`

## Data Import And Maintenance Scripts

Scripts live in `scripts` and season seed logic lives mostly in `src/lib`.

Examples:

- Pokemon fetch/import: `scripts/fetch-pokemon.ts`, `scripts/seed-pokemon.ts`, `scripts/fetch-pokemon-moves.ts`
- Historical season imports: `scripts/archive/historical-seasons`
- Data repair: `scripts/fix-*`, `scripts/compare-*`, `scripts/analyze-*`
- Elo: `src/lib/recalculate-elo.ts`

Treat scripts as operational tools. Many assume local files, local DB state, and season-specific formats.

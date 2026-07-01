# Project Overview

`pbo-site` is the web app and operations hub for the Pokemon Battle Organization draft league.

## Main Responsibilities

- Public league pages: seasons, divisions, schedules, standings, coaches, matches, drafts, leaderboards, playoffs, blog, fantasy, draft planner, matchup prep, power rankings, Elo tracker, and stats pages.
- Admin tools: seasons, coaches, rosters, transactions, matches, sheets, users, Discord, engagement, audit log, and pick-ems.
- Match result recording and replay-derived stats.
- Elo, standings, betting, pick-ems, fantasy rewards, and PBO coin settlement.
- Store cosmetics for coach/team presentation, including logo frames, glows, row backgrounds, and row borders.
- Google Sheets sync for rosters, transactions, and match stats.
- Wiglett webhooks for draft picks and match results.
- Discord bot commands and match reporting.
- Public replay analyzer for any Pokemon Showdown replay.
- Broadcast overlays for OBS/stream views.

## Runtime

- App framework: Next.js App Router.
- Database: SQLite via Drizzle/libSQL client.
- Production host: Fly.io.
- Persistent production DB: Fly volume at `/data/pbo.db`.
- Discord bot: built into `dist/bot` and started by the same container if `DISCORD_BOT_TOKEN` exists.

## Core Pages To Know

- [[Feature Map]]
- [[Operations]]
- [[Data Model]]
- [[Change Guide]]

## Core Code Files

- `src/lib/schema.ts`
- `src/lib/db.ts`
- `src/app/api/matches/route.ts`
- `src/lib/transaction-service.ts`
- `src/lib/elo-service.ts`
- `src/app/api/replay-scrape/route.ts`

## System Sketch

```text
Next.js pages/API routes
  -> shared lib services
    -> Drizzle schema/client
      -> SQLite pbo.db

External systems:
  Pokemon Showdown replays -> replay-scrape API
  Google Sheets <-> sheets sync services
  Wiglett -> integration API -> draft/match writes
  Discord -> bot services -> app API/database
  Fly.io -> app container + /data volume
```

## See Also

- [[Core League Entities]]
- [[Match Results Workflow]]
- [[Deploy Runbook]]
- [[Database Runbook]]

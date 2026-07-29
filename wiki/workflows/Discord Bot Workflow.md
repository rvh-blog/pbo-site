# Discord Bot Workflow

The Discord bot lives in `src/bot` and is built into production by the Dockerfile.

## Files

- Entry: `src/bot/index.ts`
- Client: `src/bot/client.ts`
- Commands: `src/bot/commands`
- Handlers: `src/bot/handlers`
- Match service: `src/bot/services/match-service.ts`
- Read service: `src/bot/services/read-service.ts`
- Discord audit: `src/bot/services/discord-audit.ts`
- Discord timezone preferences: `src/bot/services/discord-user-preferences.ts`
- Status diagnostics: `src/bot/services/status-service.ts`
- Build script: `scripts/build-bot.js`

## Local Commands

```bash
npm run bot
npm run bot:build
npm run bot:deploy-commands
```

## Production

The Docker build runs:

```bash
node scripts/build-bot.js
```

`scripts/start.sh` starts a bot supervisor only if `DISCORD_BOT_TOKEN` is set.
The supervisor writes the current child PID to
`/tmp/pbo-discord-bot.pid` and starts a new bot process after the child exits.

Bot crash does not stop the website. Website crash shuts down the container.
Moderators can request a bot-only restart from Admin → Discord; the endpoint
terminates the recorded child PID and the supervisor replaces it. The restart
is written to the Admin Audit Log.

## Slash Commands

With `DISCORD_DEV_GUILD_ID`, commands deploy to that guild immediately and
clear global copies.

Without it, commands deploy globally, can take up to an hour, and clear stale
guild-scoped copies so Discord does not show duplicate commands.

Registered commands:

- Writes: `/draft`, `/match`, `/schedule`
- Reads: `/team`, `/player`, `/items`, `/matchup`, `/standings`, `/status`,
  `/help`

`/schedule` offers every IANA timezone supported by the bot runtime through
region and paginated selectors. It stores the timezone by Discord user ID and
converts local match times with the correct daylight-saving rule for the match
date. Existing schedules require a current/proposed confirmation before
replacement. Preselected timezone regions and timezones include green
confirmation buttons so the saved defaults can be accepted without changing
the dropdown.

`/match` validates replay users and every replay Pokemon against the selected
fixture's time-synced Week roster. It shows warnings and a Pokemon review, then
requires confirmation before any result write. Public result posts retain
spoiler-wrapped winners, differentials, and K/D details.

Read-only commands `/standings`, `/items`, `/team`, `/player`, and `/matchup`
work in any server channel. They prompt for a public season and division; a
mapped channel's season/division is shown as the default when applicable.
Users can then choose **All Coaches** for division-wide results or one coach
to narrow the result. `/standings` can also browse schedule weeks with
Discord-local timestamps. `/help` and `/status` work without a channel
mapping.

Season and division selectors include a green **Confirm Selection** button so
users can accept an already-highlighted default, plus a red **Back** button to
return to the previous selector or cancel the first step.

Finished `/standings`, `/items`, `/team`, `/player`, and `/matchup` results
offer red **Keep Private** and green **Share Publicly** buttons. Their selector
steps remain private so other users cannot interfere. Completed `/schedule`
confirmations are always posted publicly and do not offer a privacy choice.

`/matchup` displays one side-by-side column per team, keeping each team's
coach, record, budget, and roster together.

`/schedule` is locked to the invoking channel's mapped division and only
proceeds when **Schedule Active** is enabled on that channel. It does not offer
a division selector. `/draft` and `/match` remain restricted to their
specifically mapped, enabled channels.

`/status` reports bot, website, database, latency, uptime, and command health.
`/status details:true` requires **Manage Server** and adds registration,
duplicate-command, memory, and recent audit diagnostics.

Write attempts from `/draft`, `/match`, and `/schedule` append a permanent
Discord audit record. Audit logging is best-effort so audit failure cannot turn
a successful league write into a reported failure.

## Milestone Announcements

Completed match results are queued in `milestone_evaluation_queue` for coach,
Pokemon, and regular-season milestone evaluation. Events are written
idempotently to `milestone_events`; the bot polls the queue and posts each event
once per Discord server to the triggering division's configured
**Milestone Active** channel.
Evaluation and delivery attempts retry up to three times, with delivery state
stored in `milestone_deliveries`.

Milestone evaluation runs after the normal match-result cascade and cannot make
an otherwise successful result fail. Existing historical results establish the
starting totals but are not announced or backfilled. Each new result announces
only a milestone newly reached by that result; lower milestones already present
in the starting total stay silent. Regular-season awards are evaluated only
after every regular-season fixture in the season is complete.

Coach profile pages independently derive a permanent milestone cabinet from
public historical results. This makes old and new achievements visible at the
bottom of the coach's page without inserting historical events into the Discord
delivery outbox. Pokemon milestones are attributed to the persistent coach who
controlled the Pokemon when the achievement was reached.

Milestone routing is independent from Draft, Match, and Schedule routing.
The Discord admin page exposes a **Milestone Active** toggle on every mapped
channel. Only one mapped channel can be milestone-active for a given Discord
server and division; enabling another automatically replaces the previous
selection. Existing channel mappings default to milestone-inactive until an
administrator selects destinations.

## Wake Worker

Cloudflare worker:

- `pbo-discord-worker/autumn-dew-15b9`

Wake command registration:

```bash
DISCORD_TOKEN=your_bot_token node scripts/register-wake-command.js
```

## See Also

- [[Operations]]
- [[Match Results Workflow]]

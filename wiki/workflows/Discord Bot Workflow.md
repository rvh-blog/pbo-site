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
replacement.

`/match` validates replay users and every replay Pokemon against the selected
fixture's time-synced Week roster. It shows warnings and a Pokemon review, then
requires confirmation before any result write. Public result posts retain
spoiler-wrapped winners, differentials, and K/D details.

`/standings` can switch between divisions configured for the guild and browse
schedule weeks with Discord-local timestamps.

`/status` reports bot, website, database, latency, uptime, and command health.
`/status details:true` requires **Manage Server** and adds registration,
duplicate-command, memory, and recent audit diagnostics.

Write attempts from `/draft`, `/match`, and `/schedule` append a permanent
Discord audit record. Audit logging is best-effort so audit failure cannot turn
a successful league write into a reported failure.

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

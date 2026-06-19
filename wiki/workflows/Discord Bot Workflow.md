# Discord Bot Workflow

The Discord bot lives in `src/bot` and is built into production by the Dockerfile.

## Files

- Entry: `src/bot/index.ts`
- Client: `src/bot/client.ts`
- Commands: `src/bot/commands`
- Handlers: `src/bot/handlers`
- Match service: `src/bot/services/match-service.ts`
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

`scripts/start.sh` starts the bot in the background only if `DISCORD_BOT_TOKEN` is set.

Bot crash does not stop the website. Website crash shuts down the container.

## Slash Commands

With `DISCORD_DEV_GUILD_ID`, commands deploy to that guild immediately.

Without it, commands deploy globally and can take up to an hour.

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

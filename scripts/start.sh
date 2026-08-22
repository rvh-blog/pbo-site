#!/bin/bash
# PBO Site + Discord Bot startup script
# Runs both the Next.js server and Discord bot in the same container

echo "[Startup] Starting PBO services..."

echo "[Startup] Running database migrations..."
if ! node /app/scripts/run-startup-migrations.mjs; then
  echo "[Startup] Database migration failed; services will not start"
  exit 1
fi
echo "[Startup] Database migrations complete"

BOT_PID_FILE="${DISCORD_BOT_PID_FILE:-/tmp/pbo-discord-bot.pid}"
BOT_SUPERVISOR_PID=""

# Keep the Discord bot supervised so the admin website can restart only the bot.
if [ -n "$DISCORD_BOT_TOKEN" ]; then
  supervise_bot() {
    while true; do
      echo "[Startup] Starting Discord bot..."
      node /app/dist/bot/index.js &
      CURRENT_BOT_PID=$!
      printf '%s\n' "$CURRENT_BOT_PID" > "$BOT_PID_FILE"
      echo "[Startup] Discord bot started (PID: $CURRENT_BOT_PID)"

      wait "$CURRENT_BOT_PID"
      BOT_EXIT_CODE=$?
      rm -f "$BOT_PID_FILE"
      echo "[Startup] Discord bot exited (code: $BOT_EXIT_CODE); restarting in 2 seconds..."
      sleep 2
    done
  }

  supervise_bot &
  BOT_SUPERVISOR_PID=$!
else
  echo "[Startup] DISCORD_BOT_TOKEN not set, skipping bot startup"
  rm -f "$BOT_PID_FILE"
fi

# Start Next.js server (this is the main process)
echo "[Startup] Starting Next.js server..."
node /app/server.js &
SERVER_PID=$!
echo "[Startup] Next.js server started (PID: $SERVER_PID)"

# Handle shutdown signals
cleanup() {
  echo "[Startup] Received shutdown signal, stopping services..."
  if [ -n "$BOT_SUPERVISOR_PID" ]; then
    kill "$BOT_SUPERVISOR_PID" 2>/dev/null
  fi
  if [ -f "$BOT_PID_FILE" ]; then
    CURRENT_BOT_PID="$(cat "$BOT_PID_FILE")"
    kill "$CURRENT_BOT_PID" 2>/dev/null
    rm -f "$BOT_PID_FILE"
  fi
  kill "$SERVER_PID" 2>/dev/null
  exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for the Next.js server specifically (main process)
# Bot crashing shouldn't bring down the site
wait $SERVER_PID

# If Next.js exits, shut down everything
echo "[Startup] Next.js server exited, shutting down..."
cleanup

#!/bin/bash
# PBO Site + Discord Bot startup script
# Runs both the Next.js server and Discord bot in the same container

echo "[Startup] Starting PBO services..."

# Start Discord bot in background (don't fail if it crashes)
if [ -n "$DISCORD_BOT_TOKEN" ]; then
  echo "[Startup] Starting Discord bot..."
  node /app/dist/bot/index.js &
  BOT_PID=$!
  echo "[Startup] Discord bot started (PID: $BOT_PID)"
else
  echo "[Startup] DISCORD_BOT_TOKEN not set, skipping bot startup"
  BOT_PID=""
fi

# Start Next.js server (this is the main process)
echo "[Startup] Starting Next.js server..."
node /app/server.js &
SERVER_PID=$!
echo "[Startup] Next.js server started (PID: $SERVER_PID)"

# Handle shutdown signals
cleanup() {
  echo "[Startup] Received shutdown signal, stopping services..."
  if [ -n "$BOT_PID" ]; then
    kill $BOT_PID 2>/dev/null
  fi
  kill $SERVER_PID 2>/dev/null
  exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for the Next.js server specifically (main process)
# Bot crashing shouldn't bring down the site
wait $SERVER_PID

# If Next.js exits, shut down everything
echo "[Startup] Next.js server exited, shutting down..."
cleanup

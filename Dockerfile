FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js app (increase heap size for TypeScript checking)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Build Discord bot (bundle with esbuild)
RUN node scripts/build-bot.js

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install bash for the startup script
RUN apk add --no-cache bash

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy Discord bot and all node_modules (bot needs many transitive deps)
COPY --from=builder /app/dist/bot ./dist/bot
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts/backfill-replay-move-usage.mjs ./scripts/backfill-replay-move-usage.mjs
COPY --from=builder /app/scripts/backfill-revealed-items.mjs ./scripts/backfill-revealed-items.mjs

# Copy startup script and ensure it's executable
COPY --from=builder --chmod=755 /app/scripts/start.sh ./start.sh
RUN sed -i 's/\r$//' ./start.sh

# Create data directory for SQLite and cache directory for Next.js image optimization
RUN mkdir -p /data && chown nextjs:nodejs /data
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next
RUN chown -R nextjs:nodejs /app/dist

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/bin/bash", "/app/start.sh"]

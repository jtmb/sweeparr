# ── deps ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm config set fetch-retries 5 \
	&& npm config set fetch-retry-mintimeout 20000 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm ci --no-audit --no-fund

# ── builder ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time DB for pages that read Prisma during prerender
ENV DATABASE_URL=file:/tmp/build.db

# Generate Prisma client
RUN npx prisma generate
RUN npx prisma db push

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOME=/home/nextjs

# tini handles signals/zombie reaping when running as PID 1
RUN apk add --no-cache tini

# Create an unprivileged runtime user
RUN addgroup -S -g 1001 nodejs
RUN adduser -S -D -H -u 1001 -G nodejs -h /home/nextjs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated

# Copy migration runner script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0555 ./docker-entrypoint.sh

# Runtime write paths only
RUN mkdir -p /app/data /app/logs /home/nextjs \
	&& chown -R nextjs:nodejs /app/data /app/logs /home/nextjs \
	&& chmod 0700 /app/data /app/logs

USER nextjs:nodejs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./docker-entrypoint.sh"]

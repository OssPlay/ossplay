FROM oven/bun:1.3.14-alpine AS base
WORKDIR /repo

# bun install --frozen-lockfile needs every workspace's package.json present
# (bun.lock records the whole workspace), even though this image only builds
# apps/dashboard.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/dashboard/node_modules /repo/apps/dashboard/node_modules
COPY packages/config packages/config
COPY apps/dashboard apps/dashboard
WORKDIR /repo/apps/dashboard
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id by default, which Next's
# standalone server picks up and binds to instead of all interfaces —
# override it or the server is unreachable from outside the container.
ENV HOSTNAME=0.0.0.0
WORKDIR /repo/apps/dashboard
COPY --from=builder /repo/apps/dashboard/public ./public
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static

EXPOSE 3000
CMD ["bun", "run", "apps/dashboard/server.js"]

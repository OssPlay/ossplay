FROM oven/bun:1.3.14-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/config/package.json packages/config/
COPY apps/dashboard/package.json apps/dashboard/
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
WORKDIR /repo/apps/dashboard
COPY --from=builder /repo/apps/dashboard/public ./public
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static

EXPOSE 3000
CMD ["bun", "run", "apps/dashboard/server.js"]

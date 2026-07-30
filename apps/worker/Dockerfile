FROM oven/bun:1.3.14-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY apps/worker/package.json apps/worker/
RUN bun install --frozen-lockfile

FROM base AS runner
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/packages/config/node_modules /repo/packages/config/node_modules
COPY --from=deps /repo/packages/db/node_modules /repo/packages/db/node_modules
COPY --from=deps /repo/packages/core/node_modules /repo/packages/core/node_modules
COPY --from=deps /repo/apps/worker/node_modules /repo/apps/worker/node_modules
COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/core packages/core
COPY apps/worker apps/worker

WORKDIR /repo/apps/worker
CMD ["bun", "run", "src/index.ts"]

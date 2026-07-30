FROM oven/bun:1.3.14-alpine
WORKDIR /repo
RUN apk add --no-cache ffmpeg

# bun install --frozen-lockfile needs every workspace's package.json present
# (bun.lock records the whole workspace), even though this image only runs
# apps/worker. Single stage (no cross-stage node_modules copying) so wherever
# bun decides to hoist/nest each workspace's deps just works.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN bun install --frozen-lockfile

COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/core packages/core
COPY apps/worker apps/worker

ENV NODE_ENV=production
WORKDIR /repo/apps/worker
CMD ["bun", "run", "src/index.ts"]

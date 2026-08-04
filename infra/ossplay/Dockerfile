# One image for the whole self-hosted stack (api, dashboard, worker, updater)
# instead of four — docker-compose runs this same image multiple times with
# a different OSSPLAY_ROLE env per container (see entrypoint.ts). Bigger
# image than any single old one, but one build/publish/version to manage
# instead of four in lockstep — see MEMORY.md's release-prep entry.
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /repo

# bun install --frozen-lockfile needs every workspace's package.json present
# (bun.lock records the whole workspace) — including apps/templates, even
# though it's never otherwise copied into this image (excluded from the
# production build, see MEMORY.md/ARCHITECTURE.md §2): its absence alone is
# enough to make bun consider the lockfile stale and refuse to install.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/templates/package.json apps/templates/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/mail/package.json packages/mail/
RUN bun install --frozen-lockfile

# Only apps/dashboard has an actual build step (next build); api/worker/
# updater are plain TS run directly by Bun, no bundling needed.
FROM base AS builder
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/dashboard/node_modules /repo/apps/dashboard/node_modules
COPY packages/config packages/config
COPY apps/dashboard apps/dashboard
WORKDIR /repo/apps/dashboard
RUN bun run build

FROM base AS runner
# docker-cli + the compose plugin are only used by the `updater` role (it
# shells out to `docker compose pull`/`up -d` against the host's mounted
# docker.sock — see infra/updater/index.ts) — installed here anyway since
# it's the same image for every role.
RUN apk add --no-cache ffmpeg docker-cli docker-cli-compose

# Baked in at build time from the pushed git tag (see docker-images.yml,
# which strips the `v` prefix via docker/metadata-action's semver `version`
# output) — apps/api/src/lib/server-info.ts's readVersion() reads this.
# Never hand-bumped in package.json.
ARG OSSPLAY_VERSION=dev
ENV OSSPLAY_VERSION=${OSSPLAY_VERSION}
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id by default, which Next's
# standalone server picks up and binds to instead of all interfaces —
# override it or the dashboard role is unreachable from outside the
# container.
ENV HOSTNAME=0.0.0.0

WORKDIR /repo
COPY package.json bun.lock ./

# Dashboard: standalone output only (next build already tree-shook/bundled
# its own deps into this dir) — copied before the full node_modules below so
# the full workspace copy (which has everything api/worker/updater need too)
# wins on any overlapping package rather than the dashboard-pruned one.
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/public apps/dashboard/public
COPY --from=builder /repo/apps/dashboard/.next/static apps/dashboard/.next/static

COPY --from=deps /repo/node_modules /repo/node_modules
COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/mail packages/mail
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY infra/updater infra/updater
COPY infra/ossplay/entrypoint.ts entrypoint.ts

EXPOSE 3000 3001 8787
ENTRYPOINT ["bun", "run", "entrypoint.ts"]

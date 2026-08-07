# One Dockerfile, one build/publish/version to manage — but NOT one image.
# Each role (api, dashboard, worker, updater) gets its own final stage below,
# so ghcr.io/ossplay/ossplay:<version>-api only ever contains apps/api's own
# code + the shared packages it actually imports, never apps/worker's,
# apps/dashboard's, or infra/updater's source. A container compromised (or
# just exec'd into) under one role therefore can't read or tamper with
# another role's code — especially infra/updater, the one role with the host
# docker.sock mounted, which now ships in the smallest, most isolated image
# of the four. docker-compose still runs these as separate containers with
# OSSPLAY_ROLE set per service (see entrypoint.ts) — that part is unchanged,
# only what's baked into each container's filesystem is scoped down. See
# MEMORY.md's release-prep entry and the role-isolation follow-up recorded
# alongside it.
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /repo

# bun install --frozen-lockfile needs every workspace's package.json present
# (bun.lock records the whole workspace) — including apps/templates, even
# though it's never otherwise copied into any of the images below (excluded
# from the production build, see MEMORY.md/ARCHITECTURE.md §2): its absence
# alone is enough to make bun consider the lockfile stale and refuse to
# install.
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

# Shared by every role below: version/env plumbing and the tiny role-dispatch
# entrypoint (see entrypoint.ts's own comment — it's glue, not app code, so
# every role carrying it isn't the isolation problem this split exists to
# fix). Deliberately does NOT copy node_modules here — dashboard's standalone
# output is fully self-contained (see runner-dashboard below) and pulling in
# the other roles' node_modules here would leak their dependency lists into
# every image, the same over-sharing this stage split is meant to avoid.
FROM base AS runner-base
# Baked in at build time from the pushed git tag (see docker-images.yml,
# which strips the `v` prefix from the ref) — apps/api/src/lib/server-info.ts's
# readVersion() reads this. Never hand-bumped in package.json.
ARG OSSPLAY_VERSION=dev
ENV OSSPLAY_VERSION=${OSSPLAY_VERSION}
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json bun.lock ./
COPY infra/ossplay/entrypoint.ts entrypoint.ts

FROM runner-base AS runner-dashboard
# Docker sets HOSTNAME to the container id by default, which Next's
# standalone server picks up and binds to instead of all interfaces —
# override it or this role is unreachable from outside the container.
ENV HOSTNAME=0.0.0.0
# next build's standalone output already tree-shook/traced its own deps into
# this dir (including a self-contained node_modules) — nothing else from the
# workspace is needed, which is what makes this the smallest and most
# isolated of the four images: no backend source, no backend dependencies.
COPY --from=builder /repo/apps/dashboard/.next/standalone ./
COPY --from=builder /repo/apps/dashboard/public apps/dashboard/public
COPY --from=builder /repo/apps/dashboard/.next/static apps/dashboard/.next/static
EXPOSE 3000
ENTRYPOINT ["bun", "run", "/repo/entrypoint.ts"]

FROM runner-base AS runner-api
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/mail packages/mail
COPY apps/api apps/api
# Bun's workspace install gives each member its OWN node_modules for that
# member's specific deps (e.g. apps/api/node_modules/hono) — it does NOT
# hoist everything to the root, so the root copy alone isn't enough (that
# omission previously surfaced at runtime as "Cannot find package 'hono'",
# since nothing here typechecks/bundles it at build time).
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/api/node_modules apps/api/node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules
COPY --from=deps /repo/packages/core/node_modules packages/core/node_modules
COPY --from=deps /repo/packages/mail/node_modules packages/mail/node_modules
EXPOSE 3001
ENTRYPOINT ["bun", "run", "/repo/entrypoint.ts"]

FROM runner-base AS runner-worker
RUN apk add --no-cache ffmpeg
COPY packages/db packages/db
COPY packages/core packages/core
COPY apps/worker apps/worker
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/worker/node_modules apps/worker/node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules
COPY --from=deps /repo/packages/core/node_modules packages/core/node_modules
ENTRYPOINT ["bun", "run", "/repo/entrypoint.ts"]

FROM runner-base AS runner-updater
# docker-cli + the compose plugin are only used by this role (it shells out
# to `docker compose pull`/`up -d` against the host's mounted docker.sock —
# see infra/updater/index.ts) — scoped to just this image now instead of
# every role carrying host-Docker-control tooling it never uses.
RUN apk add --no-cache docker-cli docker-cli-compose
COPY infra/updater infra/updater
COPY --from=deps /repo/node_modules /repo/node_modules
EXPOSE 8787
ENTRYPOINT ["bun", "run", "/repo/entrypoint.ts"]

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

COPY packages/config packages/config
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/mail packages/mail
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY infra/updater infra/updater
COPY infra/ossplay/entrypoint.ts entrypoint.ts

# Bun's workspace install gives each member its OWN node_modules for that
# member's specific deps (e.g. apps/api/node_modules/hono) — it does NOT
# hoist everything to the root. Copying only /repo/node_modules (root-level
# devDependencies like turbo/typescript) silently omitted hono, yaml, and
# every other app/package-local dependency, which only surfaced at runtime
# as "Cannot find package 'hono'" (api never crashes at build time, since
# nothing here typechecks/bundles it). packages/config has no deps of its
# own, hence no COPY line for it. Deliberately listed after the source
# COPY lines above (not before) so this always wins over anything a local
# build's context might otherwise carry in — same ordering convention the
# dashboard standalone-vs-full-node_modules copy below already uses.
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/api/node_modules apps/api/node_modules
COPY --from=deps /repo/apps/worker/node_modules apps/worker/node_modules
COPY --from=deps /repo/packages/db/node_modules packages/db/node_modules
COPY --from=deps /repo/packages/core/node_modules packages/core/node_modules
COPY --from=deps /repo/packages/mail/node_modules packages/mail/node_modules

EXPOSE 3000 3001 8787
# Absolute path — the updater role's docker-compose.yml overrides
# `working_dir` (to `${PWD}`, for the DooD pattern — see that file's
# comment), which would otherwise make this relative path resolve against
# the wrong directory and fail with "Module not found entrypoint.ts".
ENTRYPOINT ["bun", "run", "/repo/entrypoint.ts"]

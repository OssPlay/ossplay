# OSSPlay

[![CI](https://github.com/OssPlay/ossplay/actions/workflows/ci.yml/badge.svg)](https://github.com/OssPlay/ossplay/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

A self-hostable, open-source object storage & file management platform with configurable media processing pipelines. See [PRD.md](./PRD.md) for the full product spec and [ARCHITECTURE.md](./ARCHITECTURE.md) for how this repo (and the rest of the OSSPlay org) is structured.

This repo is the core platform: the admin dashboard, backend API, worker, database schema, and self-host infra. It does **not** include the marketing site (`website`), docs hub (`docs`), or client SDK (`sdk-js`) — those are separate repos under [github.com/OssPlay](https://github.com/OssPlay), each with independent release cycles (see [ARCHITECTURE.md §1](./ARCHITECTURE.md#1-repo-map)).

## Status

Infra scaffold — the workspace, services, and self-host stack boot and typecheck, but no product features (auth, uploads, transcoding) are implemented yet. See [ROADMAP.md](./ROADMAP.md).

## Develop

Requires [Bun](https://bun.sh) `1.3.14`+ and Docker.

```sh
bun install

# Start Postgres + Redis for local dev
docker compose -f infra/docker-compose.dev.yml up -d

# Generate/run migrations
bun run db:generate
DATABASE_URL=postgres://ossplay:ossplay@localhost:5432/ossplay bun run --filter @ossplay/db migrate

# Run everything
bun run dev
```

- Dashboard: [http://localhost:3000](http://localhost:3000)
- API health check: [http://localhost:3001/health](http://localhost:3001/health)

## Self-host

The easiest path is `install.sh` (see the `website` repo) — it downloads a pinned `docker-compose.yml` and generates `.env` for you. To do it by hand from a checkout of this repo instead:

```sh
touch infra/ossplay.yaml  # one-time: instance config (domain) bind-mounts here
echo "OSSPLAY_UPDATER_TOKEN=$(openssl rand -hex 32)" >> infra/.env
cd infra
docker compose pull
docker compose up -d
```

`api`/`dashboard`/`updater` each pull their own role-scoped `ghcr.io/ossplay/ossplay:<version>-<role>` image (see `infra/ossplay/Dockerfile`'s role-scoped stages and `infra/ossplay/entrypoint.ts`), so updating is `docker compose pull && docker compose up -d` — no rebuild, no repo checkout needed on the box itself. Pin a specific release with `OSSPLAY_VERSION=v0.0.1` in `.env`; unset (or `latest`) tracks the newest tag.

`infra/ossplay.yaml` holds instance-wide domain settings, filled in by the onboarding wizard or Settings > Instance — not a DB row, so it survives container recreation as long as the file does. Override where the `api` container looks for it with `OSSPLAY_CONFIG_PATH` (defaults to `/ossplay.yaml`, the bind-mount target above); this is also the knob a SaaS-style deployment would use to mount a per-tenant file/ConfigMap instead.

See [PRD.md §2.1](./PRD.md#21-initial-boot--automated-domainssl-setup) for the domain/SSL setup flow. Workers are provisioned separately on your own VPS via SSH — they are not part of this compose stack (see [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-data--service-flow)).

## Project layout

```
apps/dashboard   Next.js admin dashboard
apps/api         Hono API on Bun
apps/worker      BullMQ worker (deployed to user VPS via SSH, not this stack)
packages/db      Drizzle schema + migrations
packages/core    Shared job contracts, rule validation, S3 client
infra/           docker-compose, Caddy config
```

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). AI coding agents working in this repo should read [CLAUDE.md](./CLAUDE.md) first.

## License

[AGPL-3.0](./LICENSE) — see [PRD.md §7](./PRD.md#7-licensing) for the reasoning behind this choice and how it differs from the SDK's MIT license.

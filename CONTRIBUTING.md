# Contributing to OSSPlay

Thanks for considering a contribution. This repo is the core `ossplay` platform monorepo — see [ARCHITECTURE.md](./ARCHITECTURE.md) if you're looking for the marketing site, docs hub, or SDK repos instead.

## Setup

Requires [Bun](https://bun.sh) `1.3.14`+ and Docker. See [README.md](./README.md#develop) for the full local dev flow.

## Workspace commands

Run from the repo root (they fan out to every app/package via Turborepo):

```sh
bun run typecheck   # tsc --noEmit everywhere
bun run lint        # biome check everywhere
bun run test         # bun test everywhere it exists
bun run build         # build everywhere
```

Scope a command to one package with `--filter`, e.g. `bun run --filter @ossplay/api dev`.

## Before opening a PR

- `bun run typecheck`, `bun run lint`, and `bun run test` all pass locally — CI runs the same checks (`.github/workflows/ci.yml`) and won't catch anything these don't.
- If you touched `packages/db/src/schema.ts`, you generated a migration (`bun run db:generate`) and `bunx drizzle-kit check` (from `packages/db`) is clean — `.github/workflows/migrate-check.yml` enforces this.
- If you touched a BullMQ job payload or rule shape in `packages/core`, both `apps/api` (producer) and `apps/worker` (consumer) are updated in the same PR — see [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-ossplay-monorepo-layout) for why they're coupled.

## Conventions

Full baseline (including for AI coding agents) lives in [CLAUDE.md](./CLAUDE.md) — read it before making non-trivial changes. Short version: Bun-first, strict TypeScript, no unnecessary abstraction, match existing patterns before introducing new ones.

## Commit style

Small, meaningful commits over one large one. No fixed format is enforced yet, but a short imperative summary (`feat(api): add project rules endpoint`) is preferred.

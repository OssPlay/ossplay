# OSSPlay — AI Agent Baseline

This is the org-wide baseline for any AI coding agent (Claude Code or otherwise) working in an OSSPlay repo. Each individual repo (`ossplay`, `website`, `docs`, `sdk-js`, …) gets its own `CLAUDE.md`/`AGENTS.md` with repo-specific detail; those inherit from and should not contradict this file.

## Orientation

Before working in any OSSPlay repo, know where things live:

- [PRD.md](./PRD.md) — what the product does and why
- [ARCHITECTURE.md](./ARCHITECTURE.md) — repo map, monorepo layout, data flow, deployment, CI/CD
- [DESIGN.md](./DESIGN.md) — UX/design principles shared across dashboard, website, docs
- [MEMORY.md](./MEMORY.md) — dated decision log; check it before re-litigating something that was already decided and recorded
- [ROADMAP.md](./ROADMAP.md) — current phasing/priority, once scoped

If a task seems to conflict with something recorded in `MEMORY.md`, surface the conflict rather than silently picking one side.

## Conventions

- **Bun-first.** Runtime, package manager, and test runner across every repo — don't introduce npm/yarn/pnpm or Node-specific APIs where a Bun equivalent exists.
- **TypeScript, strict.** No `any` escape hatches without a comment explaining why it's unavoidable.
- **No unnecessary abstraction.** Don't build a plugin system, generic config layer, or reusable helper for something used once. Three similar lines beat a premature abstraction — this applies doubly to a pre-1.0 project where the right abstraction isn't known yet.
- **No speculative features.** Implement what the current task requires per PRD/ARCHITECTURE, not what might be useful later. Flag PRD gaps instead of quietly extending scope.
- **Match existing patterns.** Before adding a new pattern (a new state-management approach, a new way of structuring API routes, a new test style), check whether the codebase already has one and reuse it.

## The `ossplay` monorepo specifically

- **`packages/db` schema changes require a migration.** Never hand-edit the database directly or skip `drizzle-kit generate`. A schema change without a matching migration will break `migrate-check.yml` in CI.
- **`packages/db` and `packages/core` types are the contract between `apps/api` and `apps/worker`.** A change to a BullMQ job payload shape or asset/rule type must update both the producer (`api`) and consumer (`worker`) side in the same PR — this is the whole reason those two apps share a repo (see [ARCHITECTURE.md §2](./ARCHITECTURE.md#2-ossplay-monorepo-layout)).
- **Never hardcode secrets** (S3 credentials, SSH keys, API keys) — these are per-organization runtime configuration (`organizations.s3Config` in the schema), not build-time values.
- **Respect the closure-table folder invariants.** `folderClosure` rows must stay consistent (every folder is its own ancestor at depth 0, moving a folder means rewriting all affected ancestor/descendant pairs) — don't bypass the closure-table update logic with direct inserts when moving/nesting folders.
- **Project rules are JSONB and will outgrow their current shape.** When extending `projects.rules`, prefer additive changes and keep the dashboard's rule editor able to fall back to a raw view for shapes it doesn't have a form for yet (see [DESIGN.md §4](./DESIGN.md#4-dashboard-specific-ux-principles)).

## Before opening a PR

- Typecheck, lint, and unit tests pass locally (`bun run` equivalents of what `ci.yml` runs) — don't rely on CI to catch what a local run would have caught.
- For `ossplay`: if the change touches `packages/db`, confirm the migration is included and `drizzle-kit check` is clean.
- For `sdk-js`: confirm the change doesn't break the public API surface without a corresponding SemVer major bump — it's consumed by external apps.

## Explicit don'ts

- Don't add a new top-level repo or restructure the monorepo layout without it being a recorded decision in `MEMORY.md` first — the repo split in `ARCHITECTURE.md` was deliberate, not incidental.
- Don't invent brand/visual specifics (colors, logo) — `DESIGN.md` marks these `TBD` on purpose; don't fill them in unprompted.
- Don't publish `sdk-js` to npmjs.com directly — it targets GitHub Packages for now (see [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-sdk-publishing)).

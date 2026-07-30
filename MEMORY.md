# OSSPlay — Decision Log

A dated, append-only log of project-level decisions and their rationale, so future contributors and AI sessions don't re-litigate settled calls. This is project memory checked into the repo — not the same thing as any individual AI assistant's personal memory system.

Add new entries at the top. Mark a decision `Superseded` (don't delete it) if a later entry changes it, and link to the entry that supersedes it.

---

## 2026-07-30 — Two deviations caught while scaffolding `ossplay`

**Status:** Decided

While building the actual `ossplay` monorepo scaffold (see entry below for the base architecture these deviate from):

- **Dropped `packages/ui`.** It would have had exactly one consumer (`apps/dashboard`) once `website`/`docs` were confirmed to vendor their own Shadcn copies rather than depend on it — a single-consumer shared package is the premature abstraction this project's own AI-agent conventions warn against. Shadcn components live directly in `apps/dashboard/components/ui`. `ARCHITECTURE.md` and `DESIGN.md` updated to match.
- **CI publishes Docker images to GHCR, not Docker Hub.** `docker-images.yml` targets `ghcr.io/ossplay/*` using the repo's built-in `GITHUB_TOKEN` — same zero-config reasoning as the SDK's GitHub Packages decision below, no separate registry account needed yet. `PRD.md` §2.2's self-hosted *update* flow (`bun docker pull`) is unaffected in mechanism, just pointed at the new registry.

See [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-deviations-from-earlier-drafts) for the canonical record.

---

## 2026-07-30 — Initial architecture, repo strategy, and licensing

**Status:** Decided

The `OssPlay` GitHub org was created empty, with `PRD.md` as the only artifact. This session established the foundational architecture before any repo or code exists.

- **Repo strategy: core monorepo + standalone SDK/website/docs repos**, not a single monorepo and not fully split-by-service. Driving concern: the org was created anticipating more contributors and more SDKs over time, and the user specifically flagged SDKs as the axis that would multiply. Repos that release together and share type contracts (`ossplay`'s dashboard/API/worker share DB schema + BullMQ job-contract types, deploy as one Docker Compose stack) stay in one repo; repos that version/deploy independently (SDKs, marketing site, docs hub) get their own repo from day one. Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md).
- **Repo naming: clean short names**, not domain-literal (`website` not `ossplay.com`, `docs` not `docs.ossplay.com`, `sdk-js` not `sdk-javascript`). Chosen over domain-literal naming explicitly by the user.
- **`docs` is centrally hosted, not part of the self-hosted stack.** Initially drafted as an app inside the platform monorepo (mirroring the PRD's original stack diagram); corrected by the user — `docs.ossplay.com` is a single org-wide documentation hub covering the core platform, all SDKs, and the install script, deployed by the OSSPlay project itself, not something a self-hoster runs. Removed from `ossplay`'s `apps/` and the deployment diagram.
- **Product reframed as a general file management platform, not media-only.** The PRD's original framing ("Object Storage Media Management & Processing Platform") undersold that OSSPlay stores/serves arbitrary file types (PDFs, zips, docs); media processing is one capability layered on general file storage. PRD bumped to v3.0 with this correction; no schema change needed since `assets.mimeType` was already free-text.
- **SDK publishing: GitHub Packages, not npmjs.com**, for `@ossplay/sdk`. Reason: no budget for a paid npm org right now, and a scoped `@ossplay` name on GitHub Packages is free and reuses existing GitHub org auth. Explicitly designed to be a registry-config change (not a rewrite) if/when moving to npmjs.com later becomes worthwhile.
- **Licensing: AGPL-3.0 for `ossplay` (core), MIT for `sdk-js`/future SDKs/`website`/`docs`/`.github`.** AGPL-3.0 chosen for the core platform following the pattern of comparable self-hostable infra projects (Cal.com, Plausible, Chatwoot, Documenso, Novu) — permits free self-hosting/modification while requiring network-service operators of modified versions to share changes back, protecting against uncredited resale as a hosted service and leaving room for OSSPlay itself to offer a dual-licensed hosted tier later. MIT chosen for anything consumed by or embedded in third-party code (SDKs) or that has no reuse value as software (website/docs scaffolding), since a copyleft license there would only create friction for consumers.
- **Reserved-but-not-created repos:** `sdk-python`/`sdk-go`/`sdk-swift` (future language SDKs, `sdk-<lang>` convention), `get` (install script, only if it outgrows a single script in `website`), `status` (uptime page, once there's a hosted component or self-hoster volume to justify it), `blog` (separate from `website`/`docs`). Named now so the convention exists; not created until actually needed.
- **Deliverable scope/ordering (which repo gets built first, what MVP looks like) was explicitly deferred** to a future session — this session covered architecture and documentation only. See [ROADMAP.md](./ROADMAP.md).

**Artifacts produced this session:** `PRD.md` (v3.0), `ARCHITECTURE.md`, `DESIGN.md`, `AI.md`, `MEMORY.md`, `ROADMAP.md` — all currently local files in `/Users/shivamdevs/Projects/GitHub/ossplay`, which is not yet a git repo. Which repo eventually hosts these org-level docs (e.g. `.github`, or a dedicated meta repo) was not decided — flagged as an open item, not a blocker.

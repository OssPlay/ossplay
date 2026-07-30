# OSSPlay — Decision Log

A dated, append-only log of project-level decisions and their rationale, so future contributors and AI sessions don't re-litigate settled calls. This is project memory checked into the repo — not the same thing as any individual AI assistant's personal memory system.

Add new entries at the top. Mark a decision `Superseded` (don't delete it) if a later entry changes it, and link to the entry that supersedes it.

---

## 2026-07-30 — Setup/onboarding split, passkeys, instance-root user management, CLI recovery

**Status:** Decided (Superseded, in part: replaces §2.3's original "one step creates the admin, the default organization, and logs you in" bootstrap flow described in the entry below)

Large auth-surface expansion, Google-account-flow-styled: `/setup` now creates only the instance root; a separate required-organization-step onboarding wizard runs once after it. Full detail in [PRD.md §2.1/§2.4](./PRD.md#21-initial-boot-setup-and-onboarding) and [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-authorization-model).

- **Passkeys are a full first-factor replacement, not a second factor.** Matches the "Google-like" framing the user asked for explicitly — password and passkey are two independent ways to get a session, not password-then-passkey. `@simplewebauthn/server`/`browser`; RP ID/origin derived per-request from the effective host, not a persisted domain, so passkeys work before the (skippable) onboarding domain step is ever touched — at the cost of the standard WebAuthn caveat that a credential stops validating if the hostname later changes.
- **Onboarding is real per-step routes, not one page with hash-synced client state**, despite the user's own `#dns`/`#smtp` notation suggesting the latter — chosen for deep-linkability, refresh-safety, and consistency with how `/setup`/`/login` and the dashboard's `proxy.ts` pathname-based gating already work. Confirmed with the user before building.
- **Instance-root force-reset (`instance:manage_users`) is root-only, not extended to org owners/admins.** `users.passwordHash`/`totpSecret`/passkeys carry no `orgId` — there's no existing mechanism for an org-scoped role to reach them, and root already has implicit reach into every org through the existing permission model, so this isn't a new scope-crossing exception, just root's existing "sees everything" reach applied to one more resource. Confirmed with the user before building.
- **New pattern: `apps/api/src/cli/`, direct-database no-HTTP operator scripts** — no precedent existed in this repo before `reset-root.ts` (emergency recovery for a fully locked-out instance root: wrong password *and* no working second factor, so no HTTP endpoint, including the force-reset panel above, can help since all of them require being logged in as root). Shares its actual reset logic (`lib/auth/admin-reset.ts`) with the HTTP force-reset endpoints so the two paths can't drift.
- **Real Caddy/ACME automation via Caddy's admin API**, not just storing a domain — confirmed with the user before building, since it meant new infra (Caddy's admin listener exposed only within the compose network, never to the host) rather than a UI-only change. Caddy already did automatic HTTPS for whatever `OSSPLAY_DOMAIN` was set at `docker compose up` time; the actual gap closed here is changing that domain afterward without SSH+restart.
- **New standing rule: write `docs.ossplay.com` pages alongside the feature that motivates them, not in a trailing batch.** The `docs` repo (reserved since the original repo-strategy decision, not created until now) was scaffolded partway through this pass specifically because of this — see that repo's own `MEMORY.md` for the fumadocs setup and its fixed three-category taxonomy (`getting-started`/`guides`/`reference`).

---

## 2026-07-30 — Admin auth, permission model, and setup wizard

**Status:** Decided

First real feature work on `ossplay` (previous entries were architecture/scaffolding only). Scope: admin account creation, a default organization, and the first-run setup wizard — closing a real PRD gap (§2.1's wizard only ever covered domain/SSL; nothing described how an admin account comes to exist, even though the stack table already promised the API handles RBAC).

- **Corrected mid-plan: instance-level `root` above organization-level roles, not organization roles alone.** The first pass at this plan went straight to `organizationMembers(role: owner|member)` without first establishing that a single self-hosted deployment can host multiple organizations, and that things like worker-fleet SSH provisioning and domain/SSL are instance-wide, not org-scoped. Conflating "the setup-created user" with "owner of one org" would have left no clean concept for who administers the instance itself, and adding that concept later would have meant retrofitting a whole scope level. Caught and fixed before any schema was written specifically to avoid that migration. Full model: [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-authorization-model).
- **RBAC with named permission bundles, not ABAC.** Roles (`root`, `owner`, `admin`, `member`) are the assignment unit; code checks specific permissions resolved from a static role→permissions table (`apps/api/src/lib/authz/permissions.ts`), not role-identity checks scattered at call sites. Gets ABAC's practical benefit without its policy-engine cost, which would be over-engineering at this stage.
- **Sessions, not JWTs; Postgres, not Redis.** Opaque bearer token, only its SHA-256 hash persisted (`sessions.id`) — instant revocation, a DB leak doesn't yield usable sessions. Postgres because `apps/api` had no other reason to depend on Redis (only `apps/worker` does, for BullMQ); adding one solely for sessions would be infra coupling with no real benefit at self-hosted scale.
- **`hono/csrf` (already in the `hono` dependency) + `sameSite=lax`, not hand-rolled CSRF tokens.** Same-origin check, zero configuration. Verified during manual testing that it actually blocks a `Content-Type`-less POST (the classic JSON-API CSRF bypass vector) while passing legitimate `application/json` requests through untouched.
- **Dev/prod parity via a Next.js rewrite, not CORS.** `apps/dashboard` always calls relative `/api/...`; Caddy proxies it in prod, a dev-only `next.config.ts` rewrite proxies it locally. The browser never makes a cross-origin request, so no CORS configuration exists anywhere in the stack.
- **`organizations.s3Config` dropped `NOT NULL`.** An org can now exist before storage is configured — the setup wizard doesn't force S3 credentials before you can log in and look around. Storage-configuration UI itself is separate, un-built follow-up work.
- **Explicitly deferred, not silently built:** inviting additional org members, granting `root` to more than the bootstrap admin, password reset (no SMTP/email integration exists), project-level roles, a DB-driven permissions UI.
- **CI gained a real Postgres service container** (`ci.yml`) — the new setup/auth integration suite needs one, and none of the previous tests did.

---

## 2026-07-30 — Two deviations caught while scaffolding `ossplay`

**Status:** Decided

While building the actual `ossplay` monorepo scaffold (see entry below for the base architecture these deviate from):

- **Dropped `packages/ui`.** It would have had exactly one consumer (`apps/dashboard`) once `website`/`docs` were confirmed to vendor their own Shadcn copies rather than depend on it — a single-consumer shared package is the premature abstraction this project's own AI-agent conventions warn against. Shadcn components live directly in `apps/dashboard/components/ui`. `ARCHITECTURE.md` and `DESIGN.md` updated to match.
- **CI publishes Docker images to GHCR, not Docker Hub.** `docker-images.yml` targets `ghcr.io/ossplay/*` using the repo's built-in `GITHUB_TOKEN` — same zero-config reasoning as the SDK's GitHub Packages decision below, no separate registry account needed yet. `PRD.md` §2.2's self-hosted *update* flow (`bun docker pull`) is unaffected in mechanism, just pointed at the new registry.

See [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-deviations-from-earlier-drafts) for the canonical record.

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

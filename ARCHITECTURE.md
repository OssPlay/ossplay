# OSSPlay — Architecture

This document is the permanent reference for how the OSSPlay project is split across repos, how `ossplay` (the core platform) is laid out internally, and how the pieces deploy and release. Product requirements live in [PRD.md](./PRD.md); design/UX principles live in [DESIGN.md](./DESIGN.md); the rationale/history behind these decisions lives in [MEMORY.md](./MEMORY.md).

---

## 1. Repo Map

| Repo | Purpose | License | Deploys to |
| --- | --- | --- | --- |
| [`ossplay`](https://github.com/OssPlay/ossplay) | Core platform monorepo: dashboard, API, worker, DB schema, infra | AGPL-3.0 | User's own infra via Docker Compose |
| [`website`](https://github.com/OssPlay/website) | Marketing/landing site + install script (`/install.sh`) | MIT | `ossplay.com` (centrally hosted) |
| [`docs`](https://github.com/OssPlay/docs) | Canonical docs hub: self-hosting guide, API reference, SDK docs for every language | MIT | `docs.ossplay.com` (centrally hosted) |
| [`sdk-js`](https://github.com/OssPlay/sdk-js) | `@ossplay/sdk` TypeScript/JavaScript client | MIT | GitHub Packages npm registry |
| [`.github`](https://github.com/OssPlay/.github) | Org profile README + shared community health defaults | MIT | github.com/OssPlay profile |

**Reserved for later** (not created yet — naming convention established so they slot in without disrupting anything above):

- `sdk-python`, `sdk-go`, `sdk-swift`, … — future language SDKs, `sdk-<lang>` convention
- `get` (`get.ossplay.com`) — split out of `website` only if the install script grows into a real installer/CLI
- `status` (`status.ossplay.com`) — uptime/incident page, once there's a hosted component or enough self-hosters
- `blog` — long-form content, separate from `website` and `docs`

### Why this split

Repos that release together and share type contracts stay together (`ossplay`'s dashboard/API/worker share Drizzle schema types and BullMQ job-payload types, and ship as one Docker Compose stack — splitting them would mean cross-repo type-sharing overhead with no benefit). Repos that version or deploy independently get their own repo from day one — this is specifically to keep the SDK family from bloating the core repo as more language SDKs are added, and to keep `docs`/`website` deploy cycles (push to `main` → redeploy) decoupled from the core platform's tagged-release cycle. Bun workspaces + Turborepo scale fine to many contributors inside `ossplay`; the actual reason to split a repo is independent release cadence, not headcount.

---

## 2. `ossplay` Monorepo Layout

```
ossplay/
├── apps/
│   ├── dashboard/     # Next.js 15 + React 19 + Shadcn UI — org/project/asset/worker-fleet admin
│   ├── api/           # Hono on Bun — uploads, RBAC, SSH orchestration, presigned URLs
│   └── worker/        # Bun + FFmpeg/Sharp — BullMQ consumer; built into the `ossplay-worker` Docker image
├── packages/
│   ├── db/            # Drizzle schema (users, sessions, organizations, organizationMembers, projects, folderClosure, assets) + migrations
│   ├── core/           # Shared domain logic: rule validation, BullMQ job payload types, S3 client wrapper
│   └── config/         # Shared tsconfig, lint config
├── infra/
│   ├── docker-compose.yml       # Full self-host stack: api, dashboard, postgres, redis, caddy, updater sidecar
│   ├── docker-compose.dev.yml   # Local dev overrides
│   ├── caddy/                   # Caddyfile template for the auto-SSL reverse proxy
│   └── updater/                 # docker.sock-mounted auto-updater sidecar (PRD §2.2)
├── .github/workflows/  # ci.yml, docker-images.yml, migrate-check.yml
├── package.json         # Bun workspaces root
├── turbo.json
├── LICENSE               # AGPL-3.0
├── README.md
└── CONTRIBUTING.md
```

`docs` is deliberately **not** an app inside this monorepo — it's centrally hosted by the OSSPlay project itself, decoupled from what a self-hoster runs. `website` is likewise a separate repo.

### `packages/db` and `packages/core` are the coupling points

Both `apps/api` and `apps/worker` depend on `packages/db` (schema/types) and `packages/core` (job payload contracts, rule validation, S3 wrapper). This is the concrete reason `api` and `worker` live in one repo: a change to a BullMQ job payload shape has to land in both producer (`api`) and consumer (`worker`) atomically, which a single-repo PR guarantees and a cross-repo change does not.

---

## 3. Data & Service Flow

```
Dashboard (Next.js) ──HTTP──> API (Hono)
                                 │
                                 ├──> Postgres (orgs, projects, folders, assets)
                                 │
                                 └──> Redis (BullMQ) ──jobs──> Worker (on user's VPS, via SSH)
                                                                     │
                                                                     └──> S3-compatible storage
                                                                          (download raw, upload processed)
```

- The dashboard never talks to S3 or Redis directly — everything goes through the API.
- Workers are provisioned by the API over SSH (Ed25519 key generated by the dashboard, user adds the public key to their VPS), but once running they only need network access to Redis and S3 — no inbound connection from the control plane is required after setup.
- Presigned URLs and signed HLS manifests are minted by the API per project rules (PRD §3), never by the worker or dashboard directly.

---

## 4. Deployment Topology

- **`ossplay`**: self-hosted by the end user via `docker-compose.yml` — Caddy handles ACME/SSL termination and reverse-proxies to the Hono API and Next.js dashboard containers on ports 80/443 (PRD §2.1). The updater sidecar mounts `/var/run/docker.sock` to pull new images and run migrations on demand (PRD §2.2).
- **`website`** and **`docs`**: centrally hosted by the OSSPlay project (host TBD — e.g. Vercel or Cloudflare Pages; this is a deployment detail, not an architecture decision, and doesn't affect repo structure). Deploy on push to `main`.
- **`sdk-js`**: no runtime deployment — published as a package on version tags.

---

## 5. SDK Publishing

`@ossplay/sdk` publishes to **GitHub Packages' npm registry** (`npm.pkg.github.com`), scoped to the `OssPlay` org. This gets the `@ossplay/` scope for free (no npmjs.com org payment needed) and reuses GitHub auth already in place for the org. Consumers add a `.npmrc` entry pointing the `@ossplay` scope at GitHub Packages. If/when a paid or verified `@ossplay` scope on npmjs.com becomes worthwhile, this is a registry-config change for consumers, not a package rewrite.

---

## 6. CI/CD

| Repo | Workflows |
| --- | --- |
| `ossplay` | `ci.yml` (bun install → typecheck → lint → unit tests, with a real Postgres service container for the auth/setup integration suite, on every PR) · `docker-images.yml` (build+push `dashboard`/`api`/`worker` images to GHCR on version tags) · `migrate-check.yml` (drizzle-kit schema drift check) |
| `sdk-js` | `ci.yml` (typecheck/test/build) · `publish.yml` (GitHub Packages publish on version tags) |
| `website` / `docs` | `ci.yml` (typecheck/lint/build) · deploy on push to `main` |
| `.github` | none — template files only |

### Versioning

- `ossplay` uses a single SemVer tag per release covering dashboard + API + worker + their Docker images together — they must stay in lockstep since they share schema and job-contract types.
- `sdk-js` (and future `sdk-<lang>` repos) version independently via their own SemVer tags.

---

## 7. Licensing

See [PRD.md §7](./PRD.md#7-licensing) for the license table and rationale, and [MEMORY.md](./MEMORY.md) for the decision record.

---

## 8. Authorization Model

Two scope levels, not one — designed this way *before* any auth code was written, specifically to avoid a migration later (see [MEMORY.md](./MEMORY.md)):

1. **Instance** — the whole self-hosted deployment (one Postgres DB, one Docker Compose stack). Instance-level concerns: worker-fleet/SSH provisioning, domain/SSL settings, the auto-updater, creating/seeing every organization. A user is either an instance **`root`** (`users.instanceRole = 'root'`) or isn't. Root is *implicit* full access to everything instance-wide, including every organization, with no per-org membership row required.
2. **Organization** — scoped to one org via `organizationMembers`. Roles: **`owner`** (full control, can delete the org), **`admin`** (manage projects/rules/assets, not membership or deletion), **`member`** (work within existing projects per their rules, no org-settings access).

No third, project-level scope exists yet — PRD gives no signal that per-project access control (distinct from org membership) is needed, and adding a third join-table layer now would be speculative. The two-tier pattern generalizes if a `projectMembers` scope is ever needed later.

**Strategy: RBAC with named permission bundles, not ABAC.** Roles are the unit of assignment (simple to reason about, simple future UI — "make this person an Admin"), but code checks specific permissions (`instance:manage_workers`, `org:manage_members`, …) resolved from a static role→permissions table (`apps/api/src/lib/authz/permissions.ts`), never `if (role === 'owner' || role === 'admin')` scattered at call sites. This gets ABAC's practical benefit — checking a capability, not a role identity — without ABAC's cost (no policy engine, no dynamic attribute evaluation), which would be real over-engineering for this project's stage.

**Sessions**, not JWTs: a random 32-byte token in an httpOnly, `sameSite=lax` cookie; only its SHA-256 hash is persisted (`sessions.id`) — a database leak alone doesn't yield a usable session, and revocation is just deleting the row. Stored in Postgres, not Redis: `apps/api` has no other reason to depend on Redis (only `apps/worker` does, for BullMQ), and adding one solely for sessions would be new infra coupling for no real benefit at self-hosted, single-node scale.

**CSRF**: `hono/csrf`'s same-origin check, zero configuration — dashboard and API are always same-origin (Caddy in prod, a Next.js dev-only rewrite locally), so no CORS setup exists anywhere either.

Passwords hash via `Bun.password` (argon2id) — native, no dependency. Login failures return an identical generic message regardless of whether the email exists (no user enumeration). A small in-memory limiter (not Redis-backed — see the same single-instance reasoning above) rate-limits `/setup` and `/auth/login`.

---

## 9. Deviations from Earlier Drafts

Caught during actual scaffolding of `ossplay` and applied here rather than left inconsistent — see [MEMORY.md](./MEMORY.md) for the dated record:

- **No `packages/ui`.** Originally planned as a shared Shadcn primitives package, but `website` and `docs` already vendor their own copies (separate repos, separate release cycles — see [DESIGN.md §2](./DESIGN.md#2-shared-ui-foundation)), leaving `apps/dashboard` as its only consumer within this repo. A package with one consumer is the premature abstraction this project's own AI-agent conventions (see `CLAUDE.md` in the `ossplay` repo) warn against. Shadcn components live directly in `apps/dashboard/components/ui` instead, using the standard Shadcn pattern.
- **Docker images publish to GHCR, not Docker Hub.** PRD.md §2.2's prose still describes `bun docker pull` fetching from Docker Hub as the *update* mechanism a self-hoster's instance uses, which is unaffected. But the `docker-images.yml` *build* workflow that produces those images targets `ghcr.io/ossplay/*` using the repo's built-in `GITHUB_TOKEN` — same zero-config rationale as SDK publishing via GitHub Packages ([§5](#5-sdk-publishing)), no separate registry account needed yet.

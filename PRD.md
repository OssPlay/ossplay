# Product Requirements Document: OSSPlay

**Document Version:** 3.0

**Domain & Name:** OSSPlay (`ossplay.com`)

**Core Concept:** A self-hostable, open-source **Object Storage & File Management Platform** with configurable media processing pipelines — BYO infrastructure, per-project transcode/packaging rules, automated domain/SSL provisioning, and dedicated client SDKs. OSSPlay stores and serves *any* file type (PDFs, archives, documents, spreadsheets, etc.); image, video, and audio processing are configurable capabilities layered on top of general file storage, not the whole of what the platform does.

---

## 0. Product & Repo Ecosystem

OSSPlay ships as a small family of repos under the `OssPlay` GitHub org rather than one monolith, so that pieces with independent release cadence (SDKs, the marketing site, the docs hub) don't get dragged along with the core platform's release train. Full rationale and layout live in [ARCHITECTURE.md](./ARCHITECTURE.md).

| Repo | Purpose | License | Deploys to |
| --- | --- | --- | --- |
| `ossplay` | Core platform: dashboard, API, worker, DB schema, infra | AGPL-3.0 | Self-hosted, user's own infra |
| `website` | Marketing/landing site + install script | MIT | `ossplay.com` (centrally hosted) |
| `docs` | Canonical docs hub: self-hosting guide, API reference, SDK docs | MIT | `docs.ossplay.com` (centrally hosted) |
| `sdk-js` | `@ossplay/sdk` TypeScript/JavaScript client | MIT | GitHub Packages (npm registry) |
| `.github` | Org profile + shared community health defaults | MIT | github.com/OssPlay |

`docs.ossplay.com` is centrally hosted by the OSSPlay project itself — it documents every repo above (including future language SDKs) and is **not** part of what a self-hoster deploys via Docker Compose.

---

## 1. Core Technology Stack

The entire codebase leverages **Bun** as the primary runtime, package manager, and test runner across both frontend and backend modules, strictly enforcing **TypeScript**.

```
                           +-------------------------------------+
                           |            Reverse Proxy            |
                           |       (Caddy / ACME Auto-SSL)       |
                           +------------------+------------------+
                                              |
                     +------------------------+------------------------+
                     |                                                 |
                     v                                                 v
   +-----------------------------------+             +-----------------------------------+
   |        Frontend Dashboard         |             |            Backend API            |
   | Next.js + Bun + TS + Shadcn UI    |             |         Hono + Bun + TS           |
   +-----------------------------------+             +-----------------+-----------------+
                                                                        |
                                                                        v
                                                      +-----------------------------------+
                                                      |           Data & Queue            |
                                                      |    PostgreSQL (Drizzle) + Redis   |
                                                      +-----------------+-----------------+
                                                                        |
                                                                        v
                                                      +-----------------------------------+
                                                      |        Distributed Workers        |
                                                      |    Bun SSH Controller + FFmpeg    |
                                                      +-----------------------------------+

```

The Documentation Portal (`docs.ossplay.com`) is a separate, centrally-hosted repo (`docs`) — it is not part of the self-hosted stack a user deploys and is intentionally left out of the diagram above.

| Component | Technology | Justification / Role |
| --- | --- | --- |
| **Runtime & Tooling** | **Bun** | Execution runtime and package manager across all packages and services. |
| **Frontend Dashboard** | Next.js, React 19, TS, Shadcn UI | Main administration dashboard for orgs, projects, assets, and worker fleets. |
| **Backend API Server** | Hono (on Bun) | High-performance, lightweight API server handling uploads, RBAC, and SSH orchestration. |
| **Database & ORM** | PostgreSQL + Drizzle ORM | Type-safe schema definition, closure tables for drive navigation, and fast migrations. |
| **Task Queue** | Redis (BullMQ on Bun) | Asynchronous queue powering image transformations and video packaging workflows. |
| **Reverse Proxy / SSL** | Caddy | Automatic Let's Encrypt ACME certificate generation; the API pushes domain changes to it live via Caddy's own admin API, no restart required. |
| **Storage Layer** | S3-Compatible APIs | AWS S3, Cloudflare R2, MinIO, or Backblaze B2. |

---

## 2. Infrastructure & Deployment Architecture

### 2.1. Initial Boot, Setup, and Onboarding

1. **Fresh Install:** The platform boots up using Docker Compose on `http://<SERVER_IP>:3000`.
2. **Setup creates one thing: the instance root.** The dashboard detects no admin account exists (`GET /setup/status`) and shows a setup wizard instead of a login screen — name, email, password, confirm password. Submitting creates the instance `root` account and starts a session immediately. No organization or storage configuration happens here.
3. **A separate onboarding wizard runs once, right after setup**, before the dashboard itself is reachable: **Domain** (skippable), **Email/SMTP** (skippable), **Organization** (required — an instance isn't useful with zero organizations). Each step is a real, independently revisitable page, not a single form.
4. **Domain Binding & Automated SSL:** In the onboarding wizard's Domain step (or later, from Settings → Instance), the admin inputs their desired domain or subdomain (e.g., `media.mycompany.com`). The API pushes this to Caddy's own admin API (`/load`, a live reconfiguration endpoint — no restart), and Caddy requests a Let's Encrypt TLS certificate via ACME challenge, binding ports 80/443 directly to the Hono API and Next.js frontend, with zero manual Nginx or certbot configuration. Saving a domain always records it even if Caddy can't be reached (e.g. local dev) — the response reports plainly whether it was actually applied.

### 2.2. Zero-CLI UI Auto-Updater

* **Sidecar Architecture:** The `docker-compose.yml` deploys a lightweight updater container with the host `/var/run/docker.sock` mounted.
* **Update Flow:**
1. The administrator clicks **"Check for Updates"** in the OSSPlay settings page.
2. The Hono backend sends an authenticated request to the sidecar daemon.
3. The sidecar executes `bun docker pull`, fetches updated images (published to GHCR — see [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-deviations-from-earlier-drafts)), runs `drizzle-kit migrate` via a temporary container boot, and performs a zero-downtime rolling restart of the main app container.

"Zero-CLI" describes normal operation (updates) specifically — it doesn't extend to the emergency-only account-recovery CLI in §2.4, which exists precisely for the case where the UI itself is unreachable (a fully locked-out root).

### 2.3. Admin Bootstrap & Permission Model

Not originally specified in earlier drafts of this document (§2.1's wizard only covered domain/SSL) even though the stack table already promises the API handles RBAC — closed here; full technical detail in [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-authorization-model).

1. **First boot has no admin account.** Setup creates just the instance root (see §2.1) — organization creation moved to the required onboarding step, so it's no longer bundled into the same submission.
2. **Two permission scopes, not one:** instance (`root` — implicit full access to everything in this deployment, including every organization; manages worker-fleet provisioning, domain/SSL, the auto-updater, and — per §2.4 — every user's password/2FA/passkeys) and organization (`owner` / `admin` / `member`, scoped to one org's settings/projects/assets). The bootstrap admin becomes instance `root`, and an explicit `owner` of whichever organization they create during onboarding.
3. **Storage is configured separately, not during bootstrap.** An organization can exist before its S3 credentials are set — nothing forces that choice before you can log in and look around.
4. **A minimal, append-only audit log now exists** (reversing the earlier "no audit-log subsystem exists anywhere yet" line below — see 2026-08-02 in MEMORY.md), gated by its own `instance:view_audit_log` permission and viewable at `/instance/audit-logs`. It is deliberately not a general-purpose event bus: it only records a fixed, short list of root-initiated actions — instance settings changes (domain, SMTP config), user password reset/2FA clear/block/unblock/delete/org-role change, SSH key/remote server add/delete, and organization create. Read-only actions and org-member-level actions are never logged.

Explicitly out of scope for now: granting `root` to more than the bootstrap admin. Inviting additional users, password reset, and account recovery are now built — see §2.4.

### 2.4. Account Security & Recovery

1. **Two independent first-factor methods:** password (always available) and **passkeys** (WebAuthn) — a passkey is a full alternative to a password, not a second factor layered on top of one. Either gets you a session on its own.
2. **Optional second factor:** TOTP two-factor authentication, with eight one-time recovery codes issued when it's enabled (regenerable at any time from account settings).
3. **Self-service recovery**, from `/forgot-password`: an email reset link, offered only when the instance has SMTP configured, and/or a passkey — never TOTP recovery codes there, since those only make sense once a password has already been proven.
4. **Instance root can act on any user's account** from Settings → Instance → Users: force-reset a password (generates and reveals a one-time temporary password — there's no way to set a specific one from this panel) or clear a user's 2FA/passkeys entirely, without that user needing their own email or authenticator access.
5. **A fully locked-out root** (no working password, no recovery codes, no passkey — so nothing in points 1–4 helps) is the one scenario the UI itself can't solve. An operator with shell access runs a CLI recovery tool directly against the database (`docker compose exec api bun run cli:reset-root`), which resets the root's password and clears every second factor in one confirmed step. See [docs.ossplay.com](https://docs.ossplay.com) for the full walkthrough.

---

## 3. Project-Level Asset Lifecycle & Rule Configuration

Instead of global storage settings, **OSSPlay enforces asset processing rules at the Project level**. Each project defines how specific file categories are processed, stored, and served.

```
Organization
  ├── Storage / S3 Credentials
  └── Projects
       ├── Project Settings (Rules per Category)
       └── Drive System (Closure Table Folders & Assets)

```

### Asset Category Rule Matrix

```
                          PROJECT ASSET SETTINGS
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   [ Image Rules ]            [ Video Rules ]        [ Audio, Documents & Files ]
   ├── Splitting / Tile       ├── Resolutions (1080p,   ├── Static / Time-bound
   │   Presets                │   720p, 480p)            │   Presigned URLs
   ├── WebP / AVIF Conv.      ├── HLS / DASH Splitting  └── Max File Size
   └── Serving Strategy       └── ClearKey AES-128          Limits (any mimeType:
       (Static / Signed)          (On / Off)                 PDF, zip, docs, etc.)

```

| Category | Configurable Pipeline Parameters |
| --- | --- |
| **Images** | • **Processing:** Auto-convert to WebP/AVIF, create responsive breakpoints (thumbnail, mobile, desktop).<br><br>• **Splitting/Tiling:** Option to tile high-resolution images for zoomable viewports.<br><br>• **Serving Strategy:** Direct static public URL vs. time-bound signed URL generation. |
| **Videos** | • **Encoding Profiles:** Target bitrates, codec options (H.264/AAC), and resolution outputs.<br><br>• **Packaging:** HLS segment duration (e.g., 2s/4s segments) and playlist structure.<br><br>• **Protection:** Toggle AES-128 ClearKey HLS encryption on/off. Token-bound decryption keys. |
| **Audio, Documents & Files** | • **Audio Transcoding:** MP3/AAC/OGG normalization.<br><br>• **Generic Files:** PDFs, archives (zip), office documents, and any other mimeType are stored and served as-is — no transcoding pipeline, just lifecycle rules.<br><br>• **Serving:** Signed presigned URLs with strict time-to-live (TTL) expiration, or static public URLs, per project rule. |

---

## 4. SSH Worker Control Plane

To maintain zero compute costs for the core control plane, heavy processing is offloaded to distributed workers managed via SSH.

```
[ OSSPlay Dashboard ]
        │
        │ 1. Connect via Bun SSH2
        ▼
[ Remote VPS ] ──► 2. Provision Docker & Worker Container
        │
        │ 3. Listen for Redis Jobs
        ▼
[ FFmpeg Processing ] ──► 4. Transcode & Upload Directly to S3

```

1. **Agentless Connection:** The OSSPlay dashboard generates an SSH Ed25519 key. The user adds the public key to any cheap VPS (Hetzner, DigitalOcean, etc.).
2. **Dashboard Provisioning:** From the OSSPlay UI, the admin enters the server IP. The Hono API uses a Bun-native SSH library to connect, install Docker (if missing), and deploy the official `ossplay-worker` Docker container.
3. **Queue Distribution:** The worker container establishes a connection to the primary Redis queue, receives transcoding jobs (FFmpeg/Sharp), downloads raw files directly from S3, processes them according to the Project Rules, and writes processed output straight back to the S3 bucket.

---

## 5. Consumption Layer & SDK Ecosystem

OSSPlay provides official client packages, starting with TypeScript/JavaScript (`@ossplay/sdk`), to streamline consuming files and media in external web and mobile applications. Additional language SDKs (Python, Go, etc.) follow the same `sdk-<lang>` repo convention as they're added — see [ARCHITECTURE.md](./ARCHITECTURE.md).

`@ossplay/sdk` is initially published to GitHub Packages' npm registry (`@ossplay` scope, free, tied to the org's GitHub auth) rather than npmjs.com, since a paid npmjs org isn't needed for this — migrating later is a registry-config change for consumers, not a rewrite.

### 5.1. SDK Initialization Pattern

```typescript
import { OSSPlay } from '@ossplay/sdk';

const ossplay = new OSSPlay({
  serverUrl: 'https://media.mycompany.com',
  apiKey: process.env.OSSPLAY_API_KEY!,
  projectId: 'proj_8f92a10b',
});

```

### 5.2. Core SDK Features

* **Image Delivery:** Query transformed images or generate dynamic responsive srcSets.
```typescript
const imageUrl = ossplay.images.getUrl('asset_123', {
  width: 800,
  format: 'webp',
});

```


* **Secure Video Embedding:** Fetch token-authenticated HLS stream manifests for video players (hls.js, Video.js).
```typescript
const { manifestUrl, jwtToken } = await ossplay.videos.getSecureStream('asset_456', {
  domain: 'app.mycompany.com',
  expiresIn: '2h',
});

```


* **Direct File Management:** Upload, delete, or browse project drive hierarchies using a type-safe interface — any file type, not just media.

---

## 6. Database Schema (Drizzle ORM Blueprint)

`packages/db/src/schema.ts` in the `ossplay` repo is the source of truth if this ever drifts from the code; reproduced here for reference.

```typescript
import { pgTable, text, timestamp, jsonb, uuid, integer, primaryKey, index } from 'drizzle-orm/pg-core';

// Users (instance scope — see §2.3 and ARCHITECTURE.md §8)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  instanceRole: text('instance_role', { enum: ['root'] }), // nullable: no instance role by default
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Sessions — `id` is the SHA-256 hash of the raw bearer token, never the token itself
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  s3Config: jsonb('s3_config').$type<{
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }>(), // nullable: an org can exist before storage is configured
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Organization membership (org scope: owner > admin > member)
export const organizationMembers = pgTable('organization_members', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.orgId] })]);

// Projects
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  rules: jsonb('rules').$type<{
    image: { format: 'webp' | 'avif' | 'original'; splitTiles: boolean; serving: 'static' | 'signed' };
    video: { resolutions: string[]; hlsSegmentDuration: number; drmAes128: boolean };
  }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Folders (Closure Table for Drive Navigation)
export const folderClosure = pgTable('folder_closure', {
  ancestorId: uuid('ancestor_id').notNull(),
  descendantId: uuid('descendant_id').notNull(),
  depth: integer('depth').notNull(),
}, (table) => [
  primaryKey({ columns: [table.ancestorId, table.descendantId] }),
  index('folder_closure_descendant_idx').on(table.descendantId),
]);

// Assets
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  folderId: uuid('folder_id'),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  s3Path: text('s3_path').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

```

---

## 7. Licensing

- **`ossplay` (core platform): AGPL-3.0** — anyone can self-host and modify freely; anyone running a modified version as a network service must share their changes back. Standard choice for this category of self-hostable infrastructure (Cal.com, Plausible, Chatwoot, Documenso, Novu).
- **`sdk-js` and future `sdk-<lang>` repos: MIT** — client SDKs stay permissive so they can be embedded in any consuming app regardless of that app's license.
- **`website` and `docs`: MIT** for code/scaffolding; brand and content assets excluded via a NOTICE.
- **`.github`: MIT** (template files only).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full repo architecture and [MEMORY.md](./MEMORY.md) for the decision history behind these choices.

---

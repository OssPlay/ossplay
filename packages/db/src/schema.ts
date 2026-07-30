import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export type ProjectRules = {
  image: {
    format: 'webp' | 'avif' | 'original';
    splitTiles: boolean;
    serving: 'static' | 'signed';
  };
  video: {
    resolutions: string[];
    hlsSegmentDuration: number;
    drmAes128: boolean;
  };
};

// Instance scope: a user is either a `root` (implicit full access to
// everything in this deployment, including every organization, with no
// per-org membership row required) or has no instance-level role at all and
// relies entirely on organizationMembers. See ARCHITECTURE.md's
// Authorization Model section.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  instanceRole: text('instance_role', { enum: ['root'] }),
  // Quick "who signed in when" visibility (per-session detail lives on
  // `sessions` below). Set on every successful login, setup, and 2FA verify.
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  lastSignInIp: text('last_sign_in_ip'),
  // TOTP: secret is written at /auth/2fa/setup (pending) and stays until
  // overwritten by a later setup or cleared by /auth/2fa/disable;
  // `totpEnabled` is the actual gate — a written-but-unconfirmed secret
  // does not enable 2FA on its own.
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Opaque bearer tokens: `id` is the hex SHA-256 hash of the raw token that
// goes in the session cookie — only the hash is ever persisted, so a DB leak
// doesn't yield a usable session. ipAddress/userAgent captured at creation
// give per-session "who/where" visibility beyond users.lastSignInAt.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Same opaque-token-hashed-at-rest pattern as `sessions`, for the brief
// window between password verification and TOTP code entry.
export const twoFactorChallenges = pgTable('two_factor_challenges', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// One-time-use backup codes for when a user loses their TOTP device. Hashed
// like session tokens (SHA-256, not argon2id) — these are high-entropy
// random codes, not human-chosen secrets, so memory-hard hashing isn't
// needed and would just slow down verification for no benefit.
export const userRecoveryCodes = pgTable('user_recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Same hashed-at-rest token pattern as `sessions`.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Nullable: an org can exist before storage is configured — the setup
  // wizard shouldn't force S3 credentials before you can even log in.
  s3Config: jsonb('s3_config').$type<{
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Organization scope: owner (full control, can delete the org) > admin
// (manage projects/rules/assets, not membership or deletion) > member (work
// within existing projects per their rules).
export const organizationMembers = pgTable(
  'organization_members',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    orgId: uuid('org_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

// Same hashed-at-rest token pattern as `sessions`. `status` is only
// pending/accepted/revoked — expiry is derived from `expiresAt` at read
// time rather than stored, so there's no separate "expired" state to fall
// out of sync.
export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull(),
  invitedByUserId: uuid('invited_by_user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'revoked'] })
    .default('pending')
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Instance-wide SMTP/domain configuration used to live here as a singleton
// row — moved to a live-editable YAML file instead (apps/api/src/lib/
// config/instance-config.ts), so the same file works for self-hosted
// (bind-mounted next to docker-compose.yml) and a future SaaS deployment
// (a per-tenant file/ConfigMap). See MEMORY.md.

// A WebAuthn/passkey credential enrolled for a user — a full first-factor
// login replacement, not a second factor stacked on password. publicKey is
// the base64url-encoded COSE key bytes; counter is a clone-detection guard
// bumped on every successful authentication (see lib/auth/webauthn.ts).
export const webauthnCredentials = pgTable('webauthn_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').default(0).notNull(),
  deviceType: text('device_type', { enum: ['singleDevice', 'multiDevice'] }).notNull(),
  backedUp: boolean('backed_up').default(false).notNull(),
  transports: jsonb('transports').$type<string[]>(),
  deviceName: text('device_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

// Same hashed-bearer-token pattern as `twoFactorChallenges`, plus the raw
// challenge string itself (needed for verify*Response()'s expectedChallenge)
// and a type discriminator so a registration challenge can't be replayed as
// an authentication one or vice versa. userId is nullable: the login
// ceremony is usernameless/discoverable — which account it's for isn't
// known until the credential is looked up at verify time.
export const webauthnChallenges = pgTable('webauthn_challenges', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  challenge: text('challenge').notNull(),
  type: text('type', { enum: ['registration', 'authentication'] }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  rules: jsonb('rules').$type<ProjectRules>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// PRD.md §6 defines folderClosure and assets.folderId without a backing `folders`
// table (no columns for a folder's name/project/parent beyond what the closure
// table implies). Left as-is for this infra scaffold: designing the actual
// folder entity is product/schema work, not scaffolding — see MEMORY.md.
export const folderClosure = pgTable(
  'folder_closure',
  {
    ancestorId: uuid('ancestor_id').notNull(),
    descendantId: uuid('descendant_id').notNull(),
    depth: integer('depth').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ancestorId, table.descendantId] }),
    index('folder_closure_descendant_idx').on(table.descendantId),
  ],
);

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  folderId: uuid('folder_id'),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  s3Path: text('s3_path').notNull(),
  // Nullable: not known until the upload completes.
  size: bigint('size', { mode: 'number' }),
  // Free-form, type-specific (image dimensions, video duration/codec, etc.)
  // — same jsonb-for-variable-shape pattern as projects.rules.
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  // Self-reference for derived variants (a thumbnail, an HLS rendition, a
  // WebP conversion) — null means this is an original, not a variant.
  // Deleting the original cascades to its variants.
  parentAssetId: uuid('parent_asset_id').references((): AnyPgColumn => assets.id, {
    onDelete: 'cascade',
  }),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
    .default('pending')
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TwoFactorChallenge = typeof twoFactorChallenges.$inferSelect;
export type UserRecoveryCode = typeof userRecoveryCodes.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;

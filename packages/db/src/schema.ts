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

// Singleton (id is always 1) — instance-wide SMTP configuration. Root-only
// via the `instance:manage_settings` permission. smtpPasswordEncrypted is
// AES-256-GCM ciphertext (see lib/crypto/secret-box.ts), never plaintext.
export const instanceSettings = pgTable('instance_settings', {
  id: integer('id').primaryKey().default(1),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port'),
  smtpUsername: text('smtp_username'),
  smtpPasswordEncrypted: text('smtp_password_encrypted'),
  smtpFromAddress: text('smtp_from_address'),
  smtpFromName: text('smtp_from_name'),
  smtpSecure: boolean('smtp_secure').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
export type InstanceSettings = typeof instanceSettings.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;

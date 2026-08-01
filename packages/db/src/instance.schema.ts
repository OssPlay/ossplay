import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

// Instance-wide (not org-scoped) infrastructure records — see
// ARCHITECTURE.md's Authorization Model and PRD.md §4 (SSH Worker Control
// Plane). All four tables here are gated by instance:manage_workers /
// instance:manage_settings / instance:view_audit_log, never an org role.

// An Ed25519 (or pasted) keypair used to SSH into a remote VPS for worker
// provisioning. Private key is encrypted at rest via
// lib/crypto/secret-box.ts, same AES-256-GCM treatment as the SMTP
// password below — the public key alone is safe to display freely (it's
// what the operator copies into the target VPS's authorized_keys).
export const sshKeys = pgTable('ssh_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  publicKey: text('public_key').notNull(),
  privateKeyEncrypted: text('private_key_encrypted').notNull(),
  fingerprint: text('fingerprint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
});

// A registered VPS this instance can (eventually) deploy a worker
// container to. `status`/`lastCheckedAt`/`lastError` reflect the last
// "Test connection" result (a plain SSH connect + whoami) — provisioning
// itself is a placeholder until a dedicated worker image exists to deploy
// (see PRD.md §4 and MEMORY.md), so dockerInstalled/workerProvisionedAt
// stay unset for now but are modeled up front rather than added later.
// sshKeyId has no onDelete cascade/set-null — deleting a key that's still
// referenced by a server is an app-level error (instance-ssh-keys.ts),
// backed here by the DB's default NO ACTION as a safety net.
export const remoteServers = pgTable('remote_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  host: text('host').notNull(),
  port: integer('port').default(22).notNull(),
  sshUsername: text('ssh_username').notNull(),
  sshKeyId: uuid('ssh_key_id')
    .references(() => sshKeys.id)
    .notNull(),
  status: text('status', {
    enum: ['pending', 'checking', 'online', 'offline', 'error'],
  })
    .default('pending')
    .notNull(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastError: text('last_error'),
  dockerInstalled: boolean('docker_installed').default(false).notNull(),
  workerProvisionedAt: timestamp('worker_provisioned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
});

// Replaces the old singleton `smtp` section of ossplay.yaml (see
// lib/config/instance-config.ts) now that multiple named configs with a
// default flag are supported. host/port/fromAddress are the fields a
// config can't meaningfully exist without; username/password/fromName stay
// optional since some relays need no auth and a display name is cosmetic.
export const smtpConfigs = pgTable('smtp_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username'),
  passwordEncrypted: text('password_encrypted'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  secure: boolean('secure').default(true).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Append-only, deliberately minimal action list (see MEMORY.md and
// PRD.md §2.3's amended note) — not a general-purpose event bus. targetId
// is plain text rather than an FK since it points at rows across several
// unrelated tables (users, smtpConfigs, remoteServers, organizations, …).
// actorUserId is nullable and set-null-on-delete so a log entry survives
// the actor's own account being deleted later.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt.desc()),
    index('audit_logs_actor_user_id_idx').on(table.actorUserId),
  ],
);

export type SshKey = typeof sshKeys.$inferSelect;
export type RemoteServer = typeof remoteServers.$inferSelect;
export type SmtpConfig = typeof smtpConfigs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export const sshKeysRelations = relations(sshKeys, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [sshKeys.createdByUserId],
    references: [users.id],
  }),
  servers: many(remoteServers),
}));

export const remoteServersRelations = relations(remoteServers, ({ one }) => ({
  sshKey: one(sshKeys, {
    fields: [remoteServers.sshKeyId],
    references: [sshKeys.id],
  }),
  createdBy: one(users, {
    fields: [remoteServers.createdByUserId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

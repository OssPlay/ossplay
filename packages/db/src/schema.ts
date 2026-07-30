import {
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Opaque bearer tokens: `id` is the hex SHA-256 hash of the raw token that
// goes in the session cookie — only the hash is ever persisted, so a DB leak
// doesn't yield a usable session.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
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
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
    .default('pending')
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

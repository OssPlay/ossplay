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

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  s3Config: jsonb('s3_config')
    .$type<{
      endpoint: string;
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
    }>()
    .notNull(),
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
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
    .default('pending')
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

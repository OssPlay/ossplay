import { relations } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./project.schema";
import { users } from "./user.schema";

export const organizations = pgTable("organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// An org can have several — a project picks exactly one at creation and can
// switch later (new files go to the new destination, nothing about
// previously-stored files migrates). One destination = one bucket: Bun's
// native S3Client (packages/core/src/s3.ts) binds bucket at construction and
// has no account-level "list all my buckets" call, only ListObjectsV2
// within a bucket you already know — so the bucket is fixed here rather
// than picked from a live-fetched list at project-creation time.
// `visibility` is immutable once created, same as a project's — a project's
// locked-in visibility choice only holds if the destination it points to
// can't flip visibility out from under it.
export const s3Destinations = pgTable(
	"s3_destinations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		orgId: uuid("org_id")
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		label: text("label").notNull(),
		endpoint: text("endpoint").notNull(),
		region: text("region").notNull(),
		bucket: text("bucket").notNull(),
		accessKeyId: text("access_key_id").notNull(),
		secretAccessKeyEncrypted: text("secret_access_key_encrypted").notNull(),
		visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
		cloudfrontUrl: text("cloudfront_url"),
		status: text("status", { enum: ["untested", "ok", "error"] })
			.default("untested")
			.notNull(),
		lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
		lastError: text("last_error"),
		// Distinct from status/lastCheckedAt/lastError above, which are scoped
		// only to /test's cheap connectivity check (ListObjectsV2). These
		// track whether the bucket's real-world permissions (policy + Block
		// Public Access) actually match `visibility` — set by /configure
		// (apps/api) and re-verified periodically by apps/jobs's
		// s3-destination-config-check. "drifted" means it was configured
		// successfully before but a later check found it no longer matches.
		configStatus: text("config_status", {
			enum: ["unconfigured", "configured", "drifted", "error"],
		})
			.default("unconfigured")
			.notNull(),
		configuredAt: timestamp("configured_at", { withTimezone: true }),
		configCheckedAt: timestamp("config_checked_at", { withTimezone: true }),
		configError: text("config_error"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(table) => [index("s3_destinations_org_id_idx").on(table.orgId)],
);

// Organization scope: owner (full control, can delete the org) > admin
// (manage projects/rules/assets, not membership or deletion) > member (work
// within existing projects per their rules).
export const organizationMembers = pgTable(
	"organization_members",
	{
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		orgId: uuid("org_id")
			.references(() => organizations.id, { onDelete: "cascade" })
			.notNull(),
		role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

// Same hashed-at-rest token pattern as `sessions`. `status` is only
// pending/accepted/revoked — expiry is derived from `expiresAt` at read
// time rather than stored, so there's no separate "expired" state to fall
// out of sync.
export const invitations = pgTable("invitations", {
	id: uuid("id").primaryKey().defaultRandom(),
	orgId: uuid("org_id")
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	email: text("email").notNull(),
	role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
	invitedByUserId: uuid("invited_by_user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	tokenHash: text("token_hash").notNull(),
	// Plaintext copy of the same token `tokenHash` verifies — see
	// instance.schema.ts's `instanceInvitations.token` for the identical
	// rationale (re-display/copy from the pending list; `tokenHash` stays
	// the only thing the accept flow trusts).
	token: text("token").notNull(),
	status: text("status", { enum: ["pending", "accepted", "revoked"] })
		.default("pending")
		.notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	acceptedAt: timestamp("accepted_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type S3Destination = typeof s3Destinations.$inferSelect;

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(organizationMembers),
	invitations: many(invitations),
	projects: many(projects),
	s3Destinations: many(s3Destinations),
}));

export const s3DestinationsRelations = relations(s3Destinations, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [s3Destinations.orgId],
		references: [organizations.id],
	}),
	projects: many(projects),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
	user: one(users, {
		fields: [organizationMembers.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [organizationMembers.orgId],
		references: [organizations.id],
	}),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
	organization: one(organizations, {
		fields: [invitations.orgId],
		references: [organizations.id],
	}),
	invitedBy: one(users, {
		fields: [invitations.invitedByUserId],
		references: [users.id],
	}),
}));

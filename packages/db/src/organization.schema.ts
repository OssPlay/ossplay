import { relations } from "drizzle-orm";
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./project.schema";
import { users } from "./user.schema";

export const organizations = pgTable("organizations", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	// Nullable: an org can exist before storage is configured — the setup
	// wizard shouldn't force S3 credentials before you can even log in.
	s3Config: jsonb("s3_config").$type<{
		endpoint: string;
		bucket: string;
		region: string;
		accessKeyId: string;
		secretAccessKey: string;
	}>(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(organizationMembers),
	invitations: many(invitations),
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

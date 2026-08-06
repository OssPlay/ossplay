import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditLogs, remoteServers, sshKeys } from "./instance.schema";
import { invitations, organizationMembers } from "./organization.schema";
import { sessions } from "./session.schema";

// Instance scope: a user is either a `root` (implicit full access to
// everything in this deployment, including every organization, with no
// per-org membership row required), an `org_creator` (may create/list every
// organization on the instance — instance:manage_orgs only, none of root's
// other instance-wide permissions), or has no instance-level role at all and
// relies entirely on organizationMembers. See ARCHITECTURE.md's
// Authorization Model section.
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	name: text("name").notNull(),
	instanceRole: text("instance_role", { enum: ["root", "org_creator"] }),
	// Quick "who signed in when" visibility (per-session detail lives on
	// `sessions` below). Set on every successful login, setup, and 2FA verify.
	lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
	lastSignInIp: text("last_sign_in_ip"),
	// TOTP: secret is written at /auth/2fa/setup (pending) and stays until
	// overwritten by a later setup or cleared by /auth/2fa/disable;
	// `totpEnabled` is the actual gate — a written-but-unconfirmed secret
	// does not enable 2FA on its own.
	totpSecret: text("totp_secret"),
	totpEnabled: boolean("totp_enabled").default(false).notNull(),
	// Set by an instance root from /instance/users ("block"). Checked at
	// login and session validation — a blocked user can't authenticate, but
	// their row/history stays intact, distinct from a destructive delete.
	disabledAt: timestamp("disabled_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Same opaque-token-hashed-at-rest pattern as `sessions`, for the brief
// window between password verification and TOTP code entry.
export const twoFactorChallenges = pgTable("two_factor_challenges", {
	id: text("id").primaryKey(),
	userId: uuid("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One-time-use backup codes for when a user loses their TOTP device. Hashed
// like session tokens (SHA-256, not argon2id) — these are high-entropy
// random codes, not human-chosen secrets, so memory-hard hashing isn't
// needed and would just slow down verification for no benefit.
export const userRecoveryCodes = pgTable("user_recovery_codes", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	codeHash: text("code_hash").notNull(),
	usedAt: timestamp("used_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Same hashed-at-rest token pattern as `sessions`.
export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: text("id").primaryKey(),
	userId: uuid("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// A WebAuthn/passkey credential enrolled for a user — a full first-factor
// login replacement, not a second factor stacked on password. publicKey is
// the base64url-encoded COSE key bytes; counter is a clone-detection guard
// bumped on every successful authentication (see lib/auth/webauthn.ts).
export const webauthnCredentials = pgTable("webauthn_credentials", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	credentialId: text("credential_id").notNull().unique(),
	publicKey: text("public_key").notNull(),
	counter: integer("counter").default(0).notNull(),
	deviceType: text("device_type", { enum: ["singleDevice", "multiDevice"] }).notNull(),
	backedUp: boolean("backed_up").default(false).notNull(),
	transports: jsonb("transports").$type<string[]>(),
	deviceName: text("device_name"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Same hashed-bearer-token pattern as `twoFactorChallenges`, plus the raw
// challenge string itself (needed for verify*Response()'s expectedChallenge)
// and a type discriminator so a registration challenge can't be replayed as
// an authentication one or vice versa. userId is nullable: the login
// ceremony is usernameless/discoverable — which account it's for isn't
// known until the credential is looked up at verify time.
export const webauthnChallenges = pgTable("webauthn_challenges", {
	id: text("id").primaryKey(),
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	challenge: text("challenge").notNull(),
	type: text("type", { enum: ["registration", "authentication"] }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type TwoFactorChallenge = typeof twoFactorChallenges.$inferSelect;
export type UserRecoveryCode = typeof userRecoveryCodes.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;

export const usersRelations = relations(users, ({ many }) => ({
	organizationMemberships: many(organizationMembers),
	invitationsSent: many(invitations),
	sessions: many(sessions),
	twoFactorChallenges: many(twoFactorChallenges),
	recoveryCodes: many(userRecoveryCodes),
	passwordResetTokens: many(passwordResetTokens),
	webauthnCredentials: many(webauthnCredentials),
	webauthnChallenges: many(webauthnChallenges),
	sshKeysCreated: many(sshKeys),
	remoteServersCreated: many(remoteServers),
	auditLogEntries: many(auditLogs),
}));

export const twoFactorChallengesRelations = relations(twoFactorChallenges, ({ one }) => ({
	user: one(users, {
		fields: [twoFactorChallenges.userId],
		references: [users.id],
	}),
}));

export const userRecoveryCodesRelations = relations(userRecoveryCodes, ({ one }) => ({
	user: one(users, {
		fields: [userRecoveryCodes.userId],
		references: [users.id],
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id],
	}),
}));

export const webauthnCredentialsRelations = relations(webauthnCredentials, ({ one }) => ({
	user: one(users, {
		fields: [webauthnCredentials.userId],
		references: [users.id],
	}),
}));

// userId is nullable on this table alone (see the column comment above) —
// Drizzle infers a nullable one() relation from that automatically, no
// extra config needed here.
export const webauthnChallengesRelations = relations(webauthnChallenges, ({ one }) => ({
	user: one(users, {
		fields: [webauthnChallenges.userId],
		references: [users.id],
	}),
}));

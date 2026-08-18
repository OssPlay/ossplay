import type { Project, Visibility } from "./projects";

export type InstanceRepo = {
	version: `v${string}`;
	// Runtime env read server-side by apps/api (OSSPLAY_DOCS_URL/
	// OSSPLAY_WEBSITE_URL), not a NEXT_PUBLIC_* build-time var — the
	// dashboard's image is built once and shipped to every self-hoster, so a
	// build-time var can never reflect a given operator's own .env. See
	// components/layout/account-dropdown.tsx and components/ui/container.tsx.
	docsUrl: string | null;
	websiteUrl: string | null;
	updates: {
		forced: boolean;
		forcedReason: string | null;
		currentVersion: `v${string}`;
		available: boolean;
		latestVersion: string | null;
	};
};

// One row of GET /instance/audit-logs — see
// app/(app)/instance/audit-logs/page.tsx.
export interface AuditLogRow {
	id: string;
	action: string;
	targetType: string | null;
	targetId: string | null;
	metadata: Record<string, unknown> | null;
	ipAddress: string | null;
	createdAt: string;
	actorUserId: string | null;
	actorName: string | null;
	actorEmail: string | null;
}

// The org summary shown on instance/organizations/[id]'s detail page — root
// manages the org itself through its real organization/* settings pages
// (see that page's own comment), this is deliberately just enough to render
// the header and member/project counts, not a second copy of the org's full
// shape.
export interface OrganizationDetail {
	id: string;
	name: string;
	createdAt: string;
}

// The minimal membership shape instance/organizations/[id] fetches just to
// count members — distinct from organization/members's OrgMember below,
// which is the full member row (name/email/role/lastSignInAt) that page's
// own Members management table needs.
export type InstanceOrgMember = Pick<OrgMember, "userId">;

// instance/organizations/[id] only needs project ids to render a count —
// narrowed from the canonical Project rather than a second hand-rolled type.
export type InstanceOrgProject = Pick<Project, "id">;

// One row of GET /organizations (instance-wide list) — see
// app/(app)/instance/organizations/page.tsx.
export interface OrganizationRow {
	id: string;
	name: string;
	createdAt: string;
	memberCount: number;
	projectCount: number;
}

export type ServerStatus = "pending" | "checking" | "online" | "offline" | "error";

// One row of GET /instance/servers — see app/(app)/instance/servers/page.tsx.
export interface RemoteServerRow {
	id: string;
	label: string;
	host: string;
	port: number;
	sshUsername: string;
	sshKeyId: string;
	status: ServerStatus;
	lastCheckedAt: string | null;
	lastError: string | null;
	createdAt: string;
}

// The trimmed shape used by the "which SSH key" picker on instance/servers —
// see instance/ssh-keys's SshKeyRow for the full row.
export type SshKeyOption = { id: string; label: string };

// One row of GET /instance/smtp — see app/(app)/instance/smtp/page.tsx.
export interface SmtpConfigRow {
	id: string;
	name: string;
	host: string;
	port: number;
	username: string | null;
	fromAddress: string;
	fromName: string | null;
	secure: boolean;
	isDefault: boolean;
}

export type SshKeyType = "ssh-rsa" | "ssh-ed25519";

// One row of GET /instance/ssh-keys — see
// app/(app)/instance/ssh-keys/page.tsx.
export interface SshKeyRow {
	id: string;
	label: string;
	keyType: SshKeyType;
	publicKey: string;
	fingerprint: string;
	serverCount: number;
	createdAt: string;
}

// Response of POST /instance/ssh-keys/generate.
export interface SshKeyGen {
	keyType: SshKeyType;
	publicKey: string;
	privateKey: string;
	fingerprint: string;
}

// An account on this instance, in the shape shared by GET /instance/users
// (the list) and GET /instance/users/:id (the detail page's `user` field) —
// both endpoints return exactly this shape today, so instance/users/page.tsx
// and instance/users/[id]/page.tsx share this one type instead of each
// hand-rolling their own (previously InstanceUser and UserDetail
// respectively).
export interface InstanceUser {
	id: string;
	email: string;
	name: string;
	instanceRole: string | null;
	totpEnabled: boolean;
	disabledAt: string | null;
	passkeyCount: number;
	createdAt: string;
	lastSignInAt: string | null;
}

// One of a user's organization memberships, as returned alongside
// InstanceUser by GET /instance/users/:id — see
// app/(app)/instance/users/[id]/page.tsx.
export type OrgMembership = { id: string; name: string; role: string };

// A pending/accepted invitation issued instance-wide (no org yet) — see
// app/(app)/instance/users/page.tsx. Distinct from organization/members's
// OrgInvitation below, which is scoped to a specific org and carries an org
// role rather than an instance role.
export interface InstanceInvitation {
	id: string;
	email: string;
	instanceRole: "root" | "org_creator" | null;
	status: string;
	isExpired: boolean;
	createdAt: string;
	inviteUrl: string;
}

export type DestinationStatus = "untested" | "ok" | "error";
export type ConfigStatus = "unconfigured" | "configured" | "drifted" | "error";

// One row of GET /organizations/:orgId/s3-destinations — the full
// destination-management shape, distinct from types/projects.ts's
// Destination (the trimmed id/label/visibility shape used by pickers when
// creating or editing a project). See
// app/(app)/organization/destinations/page.tsx.
export interface DestinationRow {
	id: string;
	label: string;
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	visibility: Visibility;
	cloudfrontUrl: string | null;
	status: DestinationStatus;
	lastCheckedAt: string | null;
	lastError: string | null;
	configStatus: ConfigStatus;
	configuredAt: string | null;
	configCheckedAt: string | null;
	configError: string | null;
	createdAt: string;
}

// A member of a specific organization, in the shape organization/members's
// management table needs (name/email/role/lastSignInAt) — distinct from
// InstanceOrgMember above, which is the `{ userId }`-only shape
// instance/organizations/[id] fetches just to render a count. See
// app/(app)/organization/members/page.tsx.
export interface OrgMember {
	userId: string;
	name: string;
	email: string;
	role: string;
	lastSignInAt: string | null;
}

// An org-scoped invitation — see app/(app)/organization/members/page.tsx.
// Distinct from InstanceInvitation above, which is instance-wide and carries
// an instance role rather than an org role.
export interface OrgInvitation {
	id: string;
	email: string;
	role: string;
	status: string;
	isExpired: boolean;
	createdAt: string;
	inviteUrl: string;
}

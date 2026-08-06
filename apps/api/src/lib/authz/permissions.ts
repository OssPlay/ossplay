import type { OrganizationMember, User } from "@ossplay/db";

/**
 * RBAC with named permission bundles, not role checks scattered at call
 * sites — see ARCHITECTURE.md's Authorization Model section for the full
 * rationale (two scopes: instance and organization; root has implicit
 * access to every organization).
 */

export type InstancePermission =
	| "instance:manage_workers"
	| "instance:manage_settings"
	| "instance:manage_orgs"
	| "instance:manage_users"
	| "instance:view_audit_log";

export type OrgPermission =
	| "org:manage_settings"
	| "org:manage_members"
	| "org:delete"
	| "org:create_projects"
	| "org:manage_projects"
	| "org:delete_projects"
	| "org:manage_assets";

type OrgRole = OrganizationMember["role"];
type UserLike = Pick<User, "instanceRole">;
type MembershipLike = Pick<OrganizationMember, "role">;
type InstanceRole = NonNullable<User["instanceRole"]>;

const INSTANCE_ROLE_PERMISSIONS: Record<InstanceRole, readonly InstancePermission[]> = {
	root: [
		"instance:manage_workers",
		"instance:manage_settings",
		"instance:manage_orgs",
		"instance:manage_users",
		"instance:view_audit_log",
	],
	// Can create and list every organization on the instance, nothing else
	// instance-wide — see the users.instanceRole column comment.
	org_creator: ["instance:manage_orgs"],
};

const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
	owner: [
		"org:manage_settings",
		"org:manage_members",
		"org:delete",
		"org:create_projects",
		"org:manage_projects",
		"org:delete_projects",
		"org:manage_assets",
	],
	admin: ["org:create_projects", "org:manage_projects", "org:delete_projects", "org:manage_assets"],
	// Members can work within existing projects (edit rules/config) but not
	// create or delete them — that stays owner/admin only.
	member: ["org:manage_projects", "org:manage_assets"],
};

export function hasInstancePermission(user: UserLike, permission: InstancePermission): boolean {
	if (!user.instanceRole) return false;
	return INSTANCE_ROLE_PERMISSIONS[user.instanceRole].includes(permission);
}

export function hasOrgPermission(
	user: UserLike,
	membership: MembershipLike | null,
	permission: OrgPermission,
): boolean {
	if (user.instanceRole === "root") return true;
	if (!membership) return false;
	return ORG_ROLE_PERMISSIONS[membership.role].includes(permission);
}

export function can(user: UserLike, permission: InstancePermission): boolean;
export function can(
	user: UserLike,
	permission: OrgPermission,
	membership: MembershipLike | null,
): boolean;
export function can(
	user: UserLike,
	permission: InstancePermission | OrgPermission,
	membership?: MembershipLike | null,
): boolean {
	if (membership === undefined) {
		return hasInstancePermission(user, permission as InstancePermission);
	}
	return hasOrgPermission(user, membership, permission as OrgPermission);
}

import type { OrganizationMember, User } from '@ossplay/db';

/**
 * RBAC with named permission bundles, not role checks scattered at call
 * sites — see ARCHITECTURE.md's Authorization Model section for the full
 * rationale (two scopes: instance and organization; root has implicit
 * access to every organization).
 */

export type InstancePermission =
  | 'instance:manage_workers'
  | 'instance:manage_settings'
  | 'instance:manage_orgs';

export type OrgPermission =
  | 'org:manage_settings'
  | 'org:manage_members'
  | 'org:delete'
  | 'org:manage_projects'
  | 'org:manage_assets';

type OrgRole = OrganizationMember['role'];
type UserLike = Pick<User, 'instanceRole'>;
type MembershipLike = Pick<OrganizationMember, 'role'>;

const INSTANCE_ROLE_PERMISSIONS: Record<'root', readonly InstancePermission[]> = {
  root: ['instance:manage_workers', 'instance:manage_settings', 'instance:manage_orgs'],
};

const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
  owner: [
    'org:manage_settings',
    'org:manage_members',
    'org:delete',
    'org:manage_projects',
    'org:manage_assets',
  ],
  admin: ['org:manage_projects', 'org:manage_assets'],
  member: ['org:manage_assets'],
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
  if (user.instanceRole === 'root') return true;
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

export const ROLES = ["member", "admin", "owner"] as const;

// Mirrors instance/users/page.tsx's INVITE_ROLE_LABELS — same "label plus
// what it actually grants" pattern, kept accurate against the real org
// permission grants in apps/api/src/lib/authz/permissions.ts's
// ORG_ROLE_PERMISSIONS rather than restated loosely: member can edit
// existing projects and manage assets (not create/delete projects); admin
// adds create/delete projects; owner adds members and organization
// settings (rename/delete the org itself).
export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
	member: "Member — edit projects, manage assets",
	admin: "Admin — create/delete projects & assets",
	owner: "Owner — full access, members & settings",
};

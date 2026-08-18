// Fallback for every route under organization/layout.tsx besides the exact
// "/organization" index (members/projects/destinations) — this slot has
// nothing to show there.
export default function OrganizationDangerDefault() {
	return null;
}

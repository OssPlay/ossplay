// Fallback shown by instance-root-only pages when useInstanceRoleGate
// (hooks/use-instance-role-gate.ts) reports a 403 — kept as one component so
// the wording only needs to change in one place.
export function InstanceForbidden() {
	return (
		<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
	);
}

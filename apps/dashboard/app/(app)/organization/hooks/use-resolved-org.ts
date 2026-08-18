"use client";

import useSWR from "swr";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/lib/api";
import { useOrgSectionId } from "@/lib/current-org";

// Either a real membership row (from /auth/me, has `role`/`projects`) or, for
// root managing an org it doesn't belong to (navigated to from
// instance/organizations/[id] — see current-org.ts's `allowAny`), a
// synthesized stand-in built from GET /organizations/:orgId. Root always
// passes org:manage_settings/org:delete server-side regardless of
// membership (see permissions.ts), so `role: "owner"` here just drives the
// same UI a real owner would see — it's not asserting a membership that
// doesn't exist.
export type OrgLike = { id: string; name: string; role: string; projectCount: number | null };

// Shared by the organization page's `children` (rename) and `@danger`
// (delete) slots — both need the same resolved org, and SWR dedupes
// identical keys across components for free, so calling this from two
// sibling slots isn't a double-fetch.
export function useResolvedOrg() {
	const { organizations, isLoading, mutate } = useAuth();
	const orgId = useOrgSectionId();
	const membershipOrg = organizations.find((o) => o.id === orgId);

	const {
		data: fetchedOrg,
		error: fetchedOrgError,
		isLoading: fetchedOrgLoading,
	} = useSWR<{
		organization: { id: string; name: string };
	}>(!membershipOrg && orgId ? `/organizations/${orgId}` : null);

	const org: OrgLike | undefined = membershipOrg
		? {
				id: membershipOrg.id,
				name: membershipOrg.name,
				role: membershipOrg.role,
				projectCount: membershipOrg.projects.length,
			}
		: fetchedOrg
			? {
					id: fetchedOrg.organization.id,
					name: fetchedOrg.organization.name,
					role: "owner",
					projectCount: null,
				}
			: undefined;

	// Only reachable for root browsing an org outside its own membership (see
	// current-org.ts's `allowAny`) — surfaces a stale sessionStorage org id
	// (e.g. one deleted since it was last visited) as a clear message
	// instead of this page silently rendering nothing.
	const notFound =
		!membershipOrg && fetchedOrgError instanceof ApiError && fetchedOrgError.status === 404;

	return { org, isLoading: isLoading || fetchedOrgLoading, notFound, mutate };
}

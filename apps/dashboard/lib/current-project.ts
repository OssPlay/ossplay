import { useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { setCurrentOrgId, useCurrentOrgId } from "@/lib/current-org";

/**
 * Resolves a project's real owning org from the already-loaded
 * `organizations` (each carries its own projects, from `/auth/me`) rather
 * than trusting the sessionStorage-scoped "current org" (see
 * lib/current-org.ts) — a bookmarked/shared project link opened in a tab
 * whose stored org happens to be a different one would otherwise look
 * inaccessible even though the user can see this project fine. Extracted
 * from project/[projectId]/settings/{layout,page}.tsx's identical inline
 * logic once the drive/trash pages became the 3rd and 4th copies of it —
 * see CLAUDE.md's "extract after the 3rd repeat" threshold.
 */
export function useProjectContext(projectId: string | undefined) {
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const owningOrg = organizations.find((o) => o.projects.some((p) => p.id === projectId));
	const org = owningOrg ?? organizations.find((o) => o.id === orgId);
	const effectiveOrgId = owningOrg?.id ?? orgId;
	const access = owningOrg !== undefined;
	const project = owningOrg?.projects.find((p) => p.id === projectId);

	useEffect(() => {
		if (owningOrg && owningOrg.id !== orgId) setCurrentOrgId(owningOrg.id);
	}, [owningOrg, orgId]);

	return { owningOrg, org, effectiveOrgId, access, project };
}

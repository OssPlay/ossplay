"use client";

import useSWR from "swr";
import { useProjectContext } from "@/lib/current-project";
import type { Project } from "@/types/projects";

// Shared by the three project settings pages (General/Storage/Danger Zone) —
// each needs the same project record + its owning org, so this centralizes
// the useProjectContext() + projects-list fetch + find-by-id chain instead
// of tripling it.
export function useProjectDetail(projectId: string) {
	const { org, effectiveOrgId } = useProjectContext(projectId);

	const { data, mutate } = useSWR<{ projects: Project[] }>(
		effectiveOrgId ? `/organizations/${effectiveOrgId}/projects` : null,
	);
	const project = data?.projects.find((p) => p.id === projectId);

	return { project, org, effectiveOrgId, mutate };
}

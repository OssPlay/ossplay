"use client";

import { ArrowLeftIcon, FolderIcon } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Section } from "@/components/layout/section";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentOrgId } from "@/lib/current-org";
import type { Sidepanel } from "@/lib/nav-types";

type Project = { id: string; name: string; orgId: string };

export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
	const { projectId } = useParams<{ projectId: string }>();
	const { organizations } = useAuth();
	// Org is still sessionStorage-scoped (see lib/current-org.ts) — the URL
	// only carries the project id. If a bookmarked/shared link points at a
	// project that isn't in the currently-active org, the list below simply
	// won't contain it and `access` degrades to false below, same as it
	// already did for a stale sessionStorage project id before this.
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const { data: projectsData } = useSWR<{ projects: Project[] }>(
		orgId ? `/organizations/${orgId}/projects` : null,
	);
	const projectList = projectsData?.projects ?? [];
	const access = projectsData ? projectList.some((p) => p.id === projectId) : undefined;

	const sidepanel: Sidepanel = [
		{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
		{ title: "General", href: `/project/${projectId}/settings`, icon: FolderIcon },
	];

	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Project" }} access={access}>
			{children}
		</Section>
	);
}

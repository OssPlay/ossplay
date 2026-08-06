"use client";

import { ArrowLeftIcon, FolderIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Section } from "@/components/layout/section";
import { useAuth } from "@/components/providers/auth-provider";
import { setCurrentOrgId, useCurrentOrgId } from "@/lib/current-org";
import type { Sidepanel } from "@/lib/nav-types";

export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
	const { projectId } = useParams<{ projectId: string }>();
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	// The URL only carries the project id, not its org — a bookmarked/shared
	// link opened in a tab whose sessionStorage-scoped "current org" (see
	// lib/current-org.ts) happens to be a different one would otherwise look
	// inaccessible even though the user can see this project fine. `/auth/me`
	// already embeds every org's project list (organizations), so the real
	// owning org can be resolved with no extra request — access is "does ANY
	// org this user belongs to have this project," and the current-org
	// switch below is what makes the rest of the page (which still fetches
	// by orgId) actually load the right data instead of just declaring
	// access granted and then finding nothing.
	const owningOrg = organizations.find((o) => o.projects.some((p) => p.id === projectId));
	const access = owningOrg !== undefined;

	useEffect(() => {
		if (owningOrg && owningOrg.id !== orgId) setCurrentOrgId(owningOrg.id);
	}, [owningOrg, orgId]);

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

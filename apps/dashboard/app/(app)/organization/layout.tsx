"use client";

import {
	ArrowLeftIcon,
	Building2Icon,
	DatabaseIcon,
	FolderIcon,
	ServerIcon,
	UsersIcon,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import { useAuth } from "@/components/providers/auth-provider";
import { useOrgSectionId } from "@/lib/current-org";
import type { Sidepanel } from "@/lib/nav-types";

const sidepanel: Sidepanel = [
	{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
	{
		title: "Configuration",
		items: [
			{
				title: "S3 Destinations",
				href: "/organization/destinations",
				icon: DatabaseIcon,
			},
			{
				title: "Remote Servers",
				href: "/organization/servers",
				icon: ServerIcon,
			},
		],
	},
	{ title: "General", href: "/organization", icon: Building2Icon },
	{ title: "Members", href: "/organization/members", icon: UsersIcon },
	{ title: "Projects", href: "/organization/projects", icon: FolderIcon },
];

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
	const { organizations, user } = useAuth();
	// Root has implicit access to every organization regardless of membership
	// rows (see ARCHITECTURE.md's Authorization Model section) — useOrgSectionId
	// resolves to whatever org root navigated here to manage (e.g. from
	// instance/organizations/[id]'s "Manage" links, which call setCurrentOrgId
	// before navigating), not just ones they happen to belong to.
	const orgId = useOrgSectionId();
	const access = organizations.some((o) => o.id === orgId) || user.instanceRole === "root";

	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Organization" }} access={access}>
			{children}
		</Section>
	);
}

"use client";

import {
	ArrowLeftIcon,
	Building2Icon,
	DatabaseIcon,
	FolderIcon,
	ServerCogIcon,
	UsersIcon,
} from "lucide-react";
import { Fragment } from "react";
import { Section } from "@/components/layout/section";
import { useAuth } from "@/components/providers/auth-provider";
import { useOrgSectionId } from "@/lib/current-org";
import type { Sidepanel } from "@/lib/nav-types";

// Grouped to match instance/layout.tsx's icon-labeled-section convention
// (Server/Connections/Infrastructure/Access Control) instead of a flat mix
// of grouped and ungrouped items. No "Remote Servers" entry here — remote
// servers are provisioned instance-wide by root only (instance/servers);
// an org can't add or manage its own, it can only end up using one once a
// project's processing rules reference it. That page never existed, so the
// old link was a dead 404.
const sidepanel: Sidepanel = [
	{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
	{
		title: "Organization",
		icon: Building2Icon,
		items: [
			{ title: "General", href: "/organization", icon: Building2Icon },
			{ title: "Members", href: "/organization/members", icon: UsersIcon },
			{ title: "Projects", href: "/organization/projects", icon: FolderIcon },
		],
	},
	{
		title: "Infrastructure",
		icon: ServerCogIcon,
		items: [
			{
				title: "S3 Destinations",
				href: "/organization/destinations",
				icon: DatabaseIcon,
			},
		],
	},
];

export default function OrganizationLayout({
	children,
	danger,
}: {
	children: React.ReactNode;
	danger: React.ReactNode;
}) {
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
			<div className="flex flex-col gap-6">
				<Fragment key="children">{children}</Fragment>
				<Fragment key="danger">{danger}</Fragment>
			</div>
		</Section>
	);
}

"use client";

import { ArrowLeftIcon, Building2Icon, DatabaseIcon, ServerIcon, UsersIcon } from "lucide-react";
import { Section } from "@/components/layout/section";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrentOrgId } from "@/lib/current-org";
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
	{ title: "General", href: "/organization/settings", icon: Building2Icon },
	{ title: "Members", href: "/organization/settings/members", icon: UsersIcon },
];

export default function OrganizationSettingsLayout({ children }: { children: React.ReactNode }) {
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const access = organizations.some((o) => o.id === orgId);

	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Organization" }} access={access}>
			{children}
		</Section>
	);
}

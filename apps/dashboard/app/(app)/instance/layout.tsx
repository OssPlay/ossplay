"use client";

import {
	ActivityIcon,
	ArrowLeftIcon,
	Building2Icon,
	GlobeIcon,
	HardDriveIcon,
	KeyRoundIcon,
	MailIcon,
	ScrollTextIcon,
	ServerCogIcon,
	ServerIcon,
	ShieldKeyholeIcon,
	UsersIcon,
	WifiCogIcon,
} from "lucide-react";
import { Section } from "@/components/layout/section";
import type { Sidepanel } from "@/lib/nav-types";

const sidepanel: Sidepanel = [
	{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
	{
		title: "Server",
		icon: ActivityIcon,
		items: [
			{ title: "Web Server", href: "/instance", icon: ServerIcon },
			{
				title: "Domain",
				href: "/instance/domain",
				icon: GlobeIcon,
			},
		],
	},
	{
		title: "Connections",
		icon: WifiCogIcon,
		items: [{ title: "Email & SMTP", href: "/instance/smtp", icon: MailIcon }],
	},
	{
		title: "Infrastructure",
		icon: ServerCogIcon,
		items: [
			{
				title: "Remote Servers",
				href: "/instance/servers",
				icon: HardDriveIcon,
			},
			{ title: "SSH Keys", href: "/instance/ssh-keys", icon: KeyRoundIcon },
		],
	},
	{
		title: "Access Control",
		icon: ShieldKeyholeIcon,
		items: [
			{ title: "Users", href: "/instance/users", icon: UsersIcon },
			{
				title: "Organizations",
				href: "/instance/organizations",
				icon: Building2Icon,
			},
			{
				title: "Audit Logs",
				href: "/instance/audit-logs",
				icon: ScrollTextIcon,
			},
		],
	},
];

// Root-only gating for the whole /instance/* tree happens in proxy.ts now
// (checkIsInstanceRoot) — before any of this ever mounts, not after a
// client-side useAuth() resolves. This Section just supplies the shared
// sidepanel/breadcrumb.
export default function InstanceLayout({ children }: { children: React.ReactNode }) {
	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Instance", href: "/instance" }}>
			{children}
		</Section>
	);
}

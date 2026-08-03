"use client";

import { ArrowLeftIcon, ShieldIcon, UserIcon } from "lucide-react";
import { Section } from "@/components/layout/section";
import type { Sidepanel } from "@/lib/nav-types";

const sidepanel: Sidepanel = [
	{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
	{ title: "Profile", href: "/settings/profile", icon: UserIcon },
	{ title: "Security", href: "/settings/security", icon: ShieldIcon },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Settings" }}>
			{children}
		</Section>
	);
}

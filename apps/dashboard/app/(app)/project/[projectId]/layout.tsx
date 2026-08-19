"use client";

import {
	ArrowLeftIcon,
	DatabaseIcon,
	FolderCogIcon,
	HardDriveIcon,
	KeyRoundIcon,
	SettingsIcon,
	Trash2Icon,
	TriangleAlertIcon,
} from "lucide-react";
import { useParams } from "next/navigation";
import { Section } from "@/components/layout/section";
import { useProjectContext } from "@/lib/current-project";
import type { Sidepanel } from "@/lib/nav-types";

// Single Section for the whole project/[projectId] subtree — Drive, Trash,
// and Settings all share this one owning-org resolution
// (lib/current-project.ts) instead of each page re-deriving it, and share
// one sidepanel instead of settings/layout.tsx maintaining its own
// slightly-different copy.
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
	const { projectId } = useParams<{ projectId: string }>();
	const { access } = useProjectContext(projectId);

	const sidepanel: Sidepanel = [
		{ title: "Back to Dashboard", href: "/", icon: ArrowLeftIcon },
		{ title: "Drive", href: `/project/${projectId}`, icon: HardDriveIcon },
		{ title: "Trash", href: `/project/${projectId}/trash`, icon: Trash2Icon },
		{
			title: "Settings",
			icon: FolderCogIcon,
			items: [
				{ title: "General", href: `/project/${projectId}/settings`, icon: SettingsIcon },
				{ title: "Storage", href: `/project/${projectId}/settings/storage`, icon: DatabaseIcon },
				{
					title: "API Keys",
					href: `/project/${projectId}/settings/api-keys`,
					icon: KeyRoundIcon,
				},
				{
					title: "Danger Zone",
					href: `/project/${projectId}/settings/danger`,
					icon: TriangleAlertIcon,
				},
			],
		},
	];

	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Project" }} access={access}>
			{children}
		</Section>
	);
}

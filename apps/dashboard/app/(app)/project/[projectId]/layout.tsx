"use client";

import { ArrowLeftIcon, FolderCogIcon, HardDriveIcon, Trash2Icon } from "lucide-react";
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
		{ title: "Settings", href: `/project/${projectId}/settings`, icon: FolderCogIcon },
	];

	return (
		<Section sidepanel={sidepanel} breadcrumb={{ title: "Project" }} access={access}>
			{children}
		</Section>
	);
}

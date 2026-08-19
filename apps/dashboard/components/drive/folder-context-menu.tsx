"use client";

import {
	DownloadIcon,
	ExternalLinkIcon,
	FolderInputIcon,
	FolderOpenIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { DriveFolder } from "@/types/drive";

// Shared by DriveGrid and DriveList — was copy-pasted identically in both
// before this extraction. See asset-context-menu.tsx for the grouping
// rationale.
export function FolderContextMenuContent({
	folder,
	projectId,
	onRename,
	onDownloadAsZip,
	onMoveTo,
	onTrash,
}: {
	folder: DriveFolder;
	projectId: string;
	onRename: () => void;
	onDownloadAsZip: () => void;
	onMoveTo: () => void;
	onTrash: () => void;
}) {
	const router = useRouter();
	const folderUrl = `/project/${projectId}/${folder.id}`;

	return (
		<ContextMenuContent>
			<ContextMenuItem onClick={() => router.push(folderUrl)}>
				<FolderOpenIcon /> Open
			</ContextMenuItem>
			<ContextMenuItem onClick={() => window.open(folderUrl, "_blank")}>
				<ExternalLinkIcon /> Open in new tab
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onRename}>
				<PencilIcon /> Rename
			</ContextMenuItem>
			<ContextMenuItem onClick={onDownloadAsZip}>
				<DownloadIcon /> Download as zip
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onMoveTo}>
				<FolderInputIcon /> Move to…
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem variant="destructive" onClick={onTrash}>
				<Trash2Icon /> Move to trash
			</ContextMenuItem>
		</ContextMenuContent>
	);
}

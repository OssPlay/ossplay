"use client";

import {
	CopyIcon,
	DownloadIcon,
	ExternalLinkIcon,
	EyeIcon,
	FileIcon,
	FileTextIcon,
	FilmIcon,
	FolderInputIcon,
	ImageIcon,
	InfoIcon,
	LinkIcon,
	MusicIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { DriveAsset } from "@/types/drive";

export function iconForMimeType(mimeType: string) {
	if (mimeType.startsWith("image/")) return ImageIcon;
	if (mimeType.startsWith("video/")) return FilmIcon;
	if (mimeType.startsWith("audio/")) return MusicIcon;
	if (mimeType === "application/pdf") return FileTextIcon;
	return FileIcon;
}

// Only image/video/audio have an on-demand conversion path (see the
// plan's per-mimetype variant matrix) — PDFs and everything else only
// ever get their original file back, so "Download as…" isn't offered.
export function hasOnDemandVariants(mimeType: string) {
	return (
		mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/")
	);
}

// Shared by DriveGrid and DriveList — was copy-pasted identically in both
// before this extraction. Grouped by purpose (view / info / transfer /
// organize / destructive) with separators so new items have an obvious
// place to land instead of growing one flat list.
export function AssetContextMenuContent({
	asset,
	projectId,
	base,
	onRename,
	onDownloadAs,
	onCopyLink,
	onDetails,
	onDuplicate,
	onMoveTo,
	onTrash,
}: {
	asset: DriveAsset;
	projectId: string;
	base: string;
	onRename: () => void;
	onDownloadAs: () => void;
	onCopyLink: () => void;
	onDetails: () => void;
	onDuplicate: () => void;
	onMoveTo: () => void;
	onTrash: () => void;
}) {
	const router = useRouter();
	const openUrl = `/project/${projectId}/open?id=${asset.id}`;
	const contentUrl = `/api${base}/assets/${asset.id}/content`;

	return (
		<ContextMenuContent>
			<ContextMenuItem onClick={() => router.push(openUrl)}>
				<EyeIcon /> Open
			</ContextMenuItem>
			<ContextMenuItem onClick={() => window.open(openUrl, "_blank")}>
				<ExternalLinkIcon /> Open in new tab
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onDetails}>
				<InfoIcon /> Details
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onRename}>
				<PencilIcon /> Rename
			</ContextMenuItem>
			<ContextMenuItem
				onClick={() => {
					window.location.href = `${contentUrl}?disposition=attachment`;
				}}
			>
				<DownloadIcon /> Download
			</ContextMenuItem>
			{hasOnDemandVariants(asset.mimeType) && (
				<ContextMenuItem onClick={onDownloadAs}>
					<DownloadIcon /> Download as…
				</ContextMenuItem>
			)}
			<ContextMenuItem onClick={onCopyLink}>
				<LinkIcon /> Copy link
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={onDuplicate}>
				<CopyIcon /> Make a copy
			</ContextMenuItem>
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

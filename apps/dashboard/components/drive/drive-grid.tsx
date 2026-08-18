"use client";

import {
	CopyIcon,
	DownloadIcon,
	ExternalLinkIcon,
	EyeIcon,
	FileIcon,
	FileTextIcon,
	FilmIcon,
	FolderIcon,
	FolderInputIcon,
	FolderOpenIcon,
	ImageIcon,
	LinkIcon,
	MusicIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, useState } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { RenameTarget, useDriveActions } from "@/hooks/use-drive-actions";
import type { DriveSelection } from "@/hooks/use-drive-selection";
import { cn } from "@/lib/utils";
import type { DriveAsset, DriveFolder } from "@/types/drive";
import { DownloadAsDialog } from "./download-as-dialog";
import { PreviewOverlay } from "./preview-overlay";
import { RenameDialog } from "./rename-dialog";

const DRAG_MIME = "application/x-drive-items";

function iconForMimeType(mimeType: string) {
	if (mimeType.startsWith("image/")) return ImageIcon;
	if (mimeType.startsWith("video/")) return FilmIcon;
	if (mimeType.startsWith("audio/")) return MusicIcon;
	if (mimeType === "application/pdf") return FileTextIcon;
	return FileIcon;
}

// Only image/video/audio have an on-demand conversion path (see the
// plan's per-mimetype variant matrix) — PDFs and everything else only
// ever get their original file back, so "Download as…" isn't offered.
function hasOnDemandVariants(mimeType: string) {
	return (
		mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/")
	);
}

// Bespoke grid, not DataTable — spatial folder/file mixing, thumbnails, and
// right-click actions don't fit a row-oriented table well (trash/page.tsx
// uses DataTable instead, since a flat restore/delete-forever list fits it
// better).
//
// `selection` is owned by DriveView (not built here) so it survives a
// grid/list view-mode toggle instead of resetting each time. `driveActions`
// and `onMoveTo` are owned by DriveView too, now — the bulk-action bar and
// `MoveToDialog` live there so both this and DriveList share one instance
// instead of each duplicating its own.
export function DriveGrid({
	orgId,
	projectId,
	folders,
	assets,
	selection,
	driveActions,
	onMoveTo,
	onRefresh,
}: {
	orgId: string;
	projectId: string;
	folders: DriveFolder[];
	assets: DriveAsset[];
	selection: DriveSelection;
	driveActions: ReturnType<typeof useDriveActions>;
	onMoveTo: () => void;
	onRefresh: () => void;
}) {
	const router = useRouter();
	const [previewAsset, setPreviewAsset] = useState<DriveAsset | null>(null);
	const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
	const [downloadAsTarget, setDownloadAsTarget] = useState<DriveAsset | null>(null);

	const {
		base,
		trashFolderAndRefresh,
		trashAssetAndRefresh,
		moveItemsAndRefresh,
		duplicateAssetAndRefresh,
		downloadSelectionAndOpen,
		copyLink,
	} = driveActions;

	function handleDragStart(id: string, e: DragEvent) {
		const ids = selection.isSelected(id) ? selection.selected : new Set([id]);
		e.dataTransfer.setData(DRAG_MIME, JSON.stringify([...ids]));
		e.dataTransfer.effectAllowed = "move";
	}

	function handleDropOnFolder(targetFolderId: string, e: DragEvent) {
		e.preventDefault();
		const raw = e.dataTransfer.getData(DRAG_MIME);
		if (!raw) return;
		const ids = new Set<string>(JSON.parse(raw));
		if (ids.has(targetFolderId)) return;
		moveItemsAndRefresh(ids, targetFolderId);
	}

	if (folders.length === 0 && assets.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
				<FolderIcon className="size-10" />
				<p className="text-sm">
					This folder is empty — upload a file or create a folder to get started.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div
				ref={selection.containerRef}
				{...selection.containerHandlers}
				className="relative grid select-none grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			>
				{folders.map((folder) => (
					<ContextMenu key={folder.id}>
						<ContextMenuTrigger>
							<button
								type="button"
								ref={selection.registerItemRef(folder.id)}
								draggable
								onDragStart={(e) => handleDragStart(folder.id, e)}
								onDragOver={(e) => e.preventDefault()}
								onDrop={(e) => handleDropOnFolder(folder.id, e)}
								onPointerDown={(e) => selection.handleItemPointerDown(folder.id, e)}
								onClick={(e) => selection.handleItemClick(folder.id, e)}
								onDoubleClick={() => router.push(`/project/${projectId}/${folder.id}`)}
								onContextMenu={() => selection.ensureSelectedForContextMenu(folder.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter") router.push(`/project/${projectId}/${folder.id}`);
								}}
								className={cn(
									"flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border p-4 hover:bg-muted/50",
									selection.isSelected(folder.id) &&
										"border-primary bg-primary/5 ring-1 ring-primary",
								)}
							>
								<FolderIcon className="size-16 text-muted-foreground" />
								<span className="max-w-full truncate text-sm">{folder.name}</span>
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem onClick={() => router.push(`/project/${projectId}/${folder.id}`)}>
								<FolderOpenIcon /> Open
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => window.open(`/project/${projectId}/${folder.id}`, "_blank")}
							>
								<ExternalLinkIcon /> Open in new tab
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() =>
									setRenameTarget({
										name: folder.name,
										endpoint: `${base}/folders/${folder.id}`,
										bodyKey: "name",
									})
								}
							>
								<PencilIcon /> Rename
							</ContextMenuItem>
							<ContextMenuItem onClick={() => downloadSelectionAndOpen(new Set([folder.id]))}>
								<DownloadIcon /> Download as zip
							</ContextMenuItem>
							<ContextMenuItem onClick={onMoveTo}>
								<FolderInputIcon /> Move to…
							</ContextMenuItem>
							<ContextMenuItem
								variant="destructive"
								onClick={() => trashFolderAndRefresh(folder.id)}
							>
								<Trash2Icon /> Move to trash
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				))}

				{assets.map((asset) => {
					const Icon = iconForMimeType(asset.mimeType);
					const contentUrl = `/api${base}/assets/${asset.id}/content`;
					const thumbnailUrl = asset.thumbnailAssetId
						? `/api${base}/assets/${asset.thumbnailAssetId}/content`
						: null;
					return (
						<ContextMenu key={asset.id}>
							<ContextMenuTrigger>
								<button
									type="button"
									ref={selection.registerItemRef(asset.id)}
									draggable
									onDragStart={(e) => handleDragStart(asset.id, e)}
									onPointerDown={(e) => selection.handleItemPointerDown(asset.id, e)}
									onClick={(e) => selection.handleItemClick(asset.id, e)}
									onDoubleClick={() => setPreviewAsset(asset)}
									onContextMenu={() => selection.ensureSelectedForContextMenu(asset.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter") setPreviewAsset(asset);
									}}
									className={cn(
										"flex w-full cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-2xl border p-4 hover:bg-muted/50",
										selection.isSelected(asset.id) &&
											"border-primary bg-primary/5 ring-1 ring-primary",
									)}
								>
									{thumbnailUrl ? (
										// biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content — same as preview-overlay.tsx's AssetViewer
										<img src={thumbnailUrl} alt="" className="size-16 rounded-lg object-cover" />
									) : (
										<Icon className="size-16 text-muted-foreground" />
									)}
									<span className="max-w-full truncate text-sm">{asset.filename}</span>
									{asset.status !== "ready" && (
										<span className="text-[10px] text-muted-foreground capitalize">
											{asset.status}
										</span>
									)}
								</button>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem onClick={() => setPreviewAsset(asset)}>
									<EyeIcon /> Open
								</ContextMenuItem>
								<ContextMenuItem onClick={() => window.open(contentUrl, "_blank")}>
									<ExternalLinkIcon /> Open in new tab
								</ContextMenuItem>
								<ContextMenuItem
									onClick={() =>
										setRenameTarget({
											name: asset.filename,
											endpoint: `${base}/assets/${asset.id}`,
											bodyKey: "filename",
										})
									}
								>
									<PencilIcon /> Rename
								</ContextMenuItem>
								{hasOnDemandVariants(asset.mimeType) && (
									<ContextMenuItem onClick={() => setDownloadAsTarget(asset)}>
										<DownloadIcon /> Download as…
									</ContextMenuItem>
								)}
								<ContextMenuItem onClick={() => copyLink(asset.id)}>
									<LinkIcon /> Copy link
								</ContextMenuItem>
								<ContextMenuItem onClick={() => duplicateAssetAndRefresh(asset.id)}>
									<CopyIcon /> Make a copy
								</ContextMenuItem>
								<ContextMenuItem onClick={onMoveTo}>
									<FolderInputIcon /> Move to…
								</ContextMenuItem>
								<ContextMenuItem
									variant="destructive"
									onClick={() => trashAssetAndRefresh(asset.id)}
								>
									<Trash2Icon /> Move to trash
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					);
				})}

				{selection.marqueeRect && (
					<div
						className="pointer-events-none absolute z-10 rounded-sm border border-primary bg-primary/10"
						style={{
							left: selection.marqueeRect.left,
							top: selection.marqueeRect.top,
							width: selection.marqueeRect.width,
							height: selection.marqueeRect.height,
						}}
					/>
				)}
			</div>

			{previewAsset && (
				<PreviewOverlay
					orgId={orgId}
					projectId={projectId}
					asset={previewAsset}
					open={Boolean(previewAsset)}
					onOpenChange={(open) => {
						if (!open) setPreviewAsset(null);
					}}
				/>
			)}

			{renameTarget && (
				<RenameDialog
					open={Boolean(renameTarget)}
					onOpenChange={(open) => {
						if (!open) setRenameTarget(null);
					}}
					initialName={renameTarget.name}
					endpoint={renameTarget.endpoint}
					bodyKey={renameTarget.bodyKey}
					onRenamed={onRefresh}
				/>
			)}

			{downloadAsTarget && (
				<DownloadAsDialog
					orgId={orgId}
					projectId={projectId}
					asset={downloadAsTarget}
					open={Boolean(downloadAsTarget)}
					onOpenChange={(open) => {
						if (!open) setDownloadAsTarget(null);
					}}
				/>
			)}
		</div>
	);
}

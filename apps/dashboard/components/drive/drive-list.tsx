"use client";

import {
	FileIcon,
	FileTextIcon,
	FilmIcon,
	FolderIcon,
	ImageIcon,
	MusicIcon,
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
import { type RenameTarget, useDriveActions } from "@/hooks/use-drive-actions";
import type { DriveSelection } from "@/hooks/use-drive-selection";
import { formatBytes } from "@/lib/format-bytes";
import { cn, formatDatetime } from "@/lib/utils";
import type { DriveAsset, DriveFolder } from "@/types/drive";
import { DownloadAsDialog } from "./download-as-dialog";
import { MoveToDialog } from "./move-to-dialog";
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

// Row-oriented counterpart to DriveGrid — same selection/action hooks, same
// per-item context menu, just a flat name/size/modified layout instead of a
// spatial thumbnail grid. Kept as its own bespoke component rather than
// DataTable for the same reason DriveGrid is: folders+assets are two item
// types sharing one row list, which DataTable's single-envelope contract
// doesn't fit.
//
// `selection` is owned by DriveView (not built here) so it survives a
// grid/list view-mode toggle instead of resetting each time.
export function DriveList({
	orgId,
	projectId,
	folders,
	assets,
	selection,
	onRefresh,
}: {
	orgId: string;
	projectId: string;
	folders: DriveFolder[];
	assets: DriveAsset[];
	selection: DriveSelection;
	onRefresh: () => void;
}) {
	const router = useRouter();
	const [previewAsset, setPreviewAsset] = useState<DriveAsset | null>(null);
	const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
	const [moveToOpen, setMoveToOpen] = useState(false);
	const [downloadAsTarget, setDownloadAsTarget] = useState<DriveAsset | null>(null);

	const {
		base,
		bulkTrash,
		trashFolderAndRefresh,
		trashAssetAndRefresh,
		moveItemsAndRefresh,
		duplicateAssetAndRefresh,
		bulkDownload,
		downloadSelectionAndOpen,
		copyLink,
	} = useDriveActions({
		orgId,
		projectId,
		folders,
		assets,
		selected: selection.selected,
		onRefresh,
	});

	async function handleBulkTrash() {
		await bulkTrash
			.trigger()
			.then(() => {
				selection.clear();
				onRefresh();
			})
			.catch(() => {});
	}

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
			{selection.selected.size > 0 && (
				<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
					<span className="text-sm">{selection.selected.size} selected</span>
					<button
						type="button"
						onClick={() => downloadSelectionAndOpen(selection.selected)}
						disabled={bulkDownload.isLoading}
						className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline"
					>
						Download
					</button>
					<button
						type="button"
						onClick={() => setMoveToOpen(true)}
						className="text-sm text-muted-foreground hover:text-foreground hover:underline"
					>
						Move to…
					</button>
					<button
						type="button"
						onClick={handleBulkTrash}
						disabled={bulkTrash.isLoading}
						className="flex items-center gap-1 text-sm text-destructive hover:underline"
					>
						<Trash2Icon className="size-3.5" /> Move to trash
					</button>
				</div>
			)}

			<div className="overflow-hidden rounded-lg border">
				<div className="flex items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					<span className="flex-1">Name</span>
					<span className="w-24 text-right">Size</span>
					<span className="w-40 text-right">Modified</span>
				</div>
				<div
					ref={selection.containerRef}
					{...selection.containerHandlers}
					className="relative select-none"
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
										"flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50",
										selection.isSelected(folder.id) &&
											"bg-primary/5 ring-1 ring-inset ring-primary",
									)}
								>
									<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="flex-1 truncate text-sm">{folder.name}</span>
									<span className="w-24 shrink-0 text-right text-xs text-muted-foreground">—</span>
									<span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
										{formatDatetime(folder.updatedAt)}
									</span>
								</button>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem onClick={() => router.push(`/project/${projectId}/${folder.id}`)}>
									Open
								</ContextMenuItem>
								<ContextMenuItem
									onClick={() => window.open(`/project/${projectId}/${folder.id}`, "_blank")}
								>
									Open in new tab
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
									Rename
								</ContextMenuItem>
								<ContextMenuItem onClick={() => downloadSelectionAndOpen(new Set([folder.id]))}>
									Download as zip
								</ContextMenuItem>
								<ContextMenuItem onClick={() => setMoveToOpen(true)}>Move to…</ContextMenuItem>
								<ContextMenuItem
									variant="destructive"
									onClick={() => trashFolderAndRefresh(folder.id)}
								>
									Move to trash
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
											"flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50",
											selection.isSelected(asset.id) &&
												"bg-primary/5 ring-1 ring-inset ring-primary",
										)}
									>
										{thumbnailUrl ? (
											// biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content — same as preview-overlay.tsx's AssetViewer
											<img
												src={thumbnailUrl}
												alt=""
												className="size-4 shrink-0 rounded object-cover"
											/>
										) : (
											<Icon className="size-4 shrink-0 text-muted-foreground" />
										)}
										<span className="flex-1 truncate text-sm">{asset.filename}</span>
										{asset.status !== "ready" && (
											<span className="shrink-0 text-[10px] text-muted-foreground capitalize">
												{asset.status}
											</span>
										)}
										<span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
											{asset.size != null ? formatBytes(asset.size) : "—"}
										</span>
										<span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
											{formatDatetime(asset.updatedAt)}
										</span>
									</button>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem onClick={() => setPreviewAsset(asset)}>Open</ContextMenuItem>
									<ContextMenuItem onClick={() => window.open(contentUrl, "_blank")}>
										Open in new tab
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
										Rename
									</ContextMenuItem>
									{hasOnDemandVariants(asset.mimeType) && (
										<ContextMenuItem onClick={() => setDownloadAsTarget(asset)}>
											Download as…
										</ContextMenuItem>
									)}
									<ContextMenuItem onClick={() => copyLink(asset.id)}>Copy link</ContextMenuItem>
									<ContextMenuItem onClick={() => duplicateAssetAndRefresh(asset.id)}>
										Make a copy
									</ContextMenuItem>
									<ContextMenuItem onClick={() => setMoveToOpen(true)}>Move to…</ContextMenuItem>
									<ContextMenuItem
										variant="destructive"
										onClick={() => trashAssetAndRefresh(asset.id)}
									>
										Move to trash
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

			<MoveToDialog
				orgId={orgId}
				projectId={projectId}
				open={moveToOpen}
				onOpenChange={setMoveToOpen}
				onSelectFolder={(target) => moveItemsAndRefresh(selection.selected, target)}
			/>

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

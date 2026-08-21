"use client";

import { FolderIcon, Loader2Icon, MoreVerticalIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, useState } from "react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { RenameTarget, useDriveActions } from "@/hooks/use-drive-actions";
import type { DriveSelection } from "@/hooks/use-drive-selection";
import { openContextMenu } from "@/lib/open-context-menu";
import { cn } from "@/lib/utils";
import type { DriveAsset, DriveFolder } from "@/types/drive";
import { AddAudioTrackDialog } from "./add-audio-track-dialog";
import { AddSubtitleDialog } from "./add-subtitle-dialog";
import { AssetContextMenuContent, iconForMimeType } from "./asset-context-menu";
import { AssetDetailsPanel } from "./asset-details-panel";
import { CopyLinkDialog } from "./copy-link-dialog";
import { DownloadAsDialog } from "./download-as-dialog";
import { EmbedDialog } from "./embed-dialog";
import { FolderContextMenuContent } from "./folder-context-menu";
import { RenameDialog } from "./rename-dialog";

const DRAG_MIME = "application/x-drive-items";

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
	projectVisibility,
	folders,
	assets,
	selection,
	driveActions,
	onMoveTo,
	onRefresh,
}: {
	orgId: string;
	projectId: string;
	projectVisibility: "public" | "private";
	folders: DriveFolder[];
	assets: DriveAsset[];
	selection: DriveSelection;
	driveActions: ReturnType<typeof useDriveActions>;
	onMoveTo: () => void;
	onRefresh: () => void;
}) {
	const router = useRouter();
	const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
	const [downloadAsTarget, setDownloadAsTarget] = useState<DriveAsset | null>(null);
	const [copyLinkTarget, setCopyLinkTarget] = useState<DriveAsset | null>(null);
	const [detailsTarget, setDetailsTarget] = useState<DriveAsset | null>(null);
	const [embedTarget, setEmbedTarget] = useState<DriveAsset | null>(null);
	const [addSubtitleTarget, setAddSubtitleTarget] = useState<DriveAsset | null>(null);
	const [addAudioTrackTarget, setAddAudioTrackTarget] = useState<DriveAsset | null>(null);

	const {
		base,
		trashFolderAndRefresh,
		trashAssetAndRefresh,
		moveItemsAndRefresh,
		duplicateAssetAndRefresh,
		downloadSelectionAndOpen,
		copyPublicLink,
	} = driveActions;

	function handleCopyLink(asset: DriveAsset) {
		if (projectVisibility === "public") copyPublicLink(asset.id);
		else setCopyLinkTarget(asset);
	}

	function openAsset(assetId: string) {
		router.push(`/project/${projectId}/open?id=${assetId}`);
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
			<div
				ref={selection.containerRef}
				{...selection.containerHandlers}
				className="relative grid select-none grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			>
				{folders.map((folder) => (
					<ContextMenu key={folder.id}>
						<ContextMenuTrigger>
							{/* biome-ignore lint/a11y/useSemanticElements: needs to contain a real <button> (the "…" trigger below) — a <button> can't nest one, so this is a div with the button role/keyboard handling added by hand instead. */}
							<div
								role="button"
								tabIndex={0}
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
									"group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/30",
									selection.isSelected(folder.id) &&
										"border-primary bg-primary/5 ring-1 ring-primary",
								)}
							>
								<div className="flex aspect-square w-full items-center justify-center bg-muted/40">
									<FolderIcon className="size-14 text-muted-foreground" />
								</div>
								<div className="p-3">
									<span className="block truncate text-sm">{folder.name}</span>
								</div>
								<button
									type="button"
									onClick={openContextMenu}
									aria-label="More actions"
									className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
								>
									<MoreVerticalIcon className="size-4" />
								</button>
							</div>
						</ContextMenuTrigger>
						<FolderContextMenuContent
							folder={folder}
							projectId={projectId}
							onRename={() =>
								setRenameTarget({
									name: folder.name,
									endpoint: `${base}/folders/${folder.id}`,
									bodyKey: "name",
								})
							}
							onDownloadAsZip={() => downloadSelectionAndOpen(new Set([folder.id]))}
							onMoveTo={onMoveTo}
							onTrash={() => trashFolderAndRefresh(folder.id)}
						/>
					</ContextMenu>
				))}

				{assets.map((asset) => {
					const Icon = iconForMimeType(asset.mimeType);
					const thumbnailUrl = asset.thumbnailAssetId
						? `/api${base}/assets/${asset.thumbnailAssetId}/content`
						: null;
					const isProcessing =
						asset.status === "pending" ||
						asset.status === "processing" ||
						asset.hasProcessingVariants === true;
					return (
						<ContextMenu key={asset.id}>
							<ContextMenuTrigger>
								{/* biome-ignore lint/a11y/useSemanticElements: needs to contain a real <button> (the "…" trigger below) — a <button> can't nest one, so this is a div with the button role/keyboard handling added by hand instead. */}
								<div
									role="button"
									tabIndex={0}
									ref={selection.registerItemRef(asset.id)}
									draggable
									onDragStart={(e) => handleDragStart(asset.id, e)}
									onPointerDown={(e) => selection.handleItemPointerDown(asset.id, e)}
									onClick={(e) => selection.handleItemClick(asset.id, e)}
									onDoubleClick={() => openAsset(asset.id)}
									onContextMenu={() => selection.ensureSelectedForContextMenu(asset.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter") openAsset(asset.id);
									}}
									className={cn(
										"group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/30",
										selection.isSelected(asset.id) &&
											"border-primary bg-primary/5 ring-1 ring-primary",
									)}
								>
									<div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted/40">
										{thumbnailUrl ? (
											// biome-ignore lint/performance/noImgElement: dynamic, arbitrary-origin content — same as asset-preview.tsx's AssetViewer
											<img src={thumbnailUrl} alt="" className="size-full object-cover" />
										) : (
											<Icon className="size-14 text-muted-foreground" />
										)}
										{(isProcessing || asset.status === "failed") && (
											<div className="absolute inset-0 flex items-center justify-center bg-background/70">
												{isProcessing ? (
													<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
												) : (
													<TriangleAlertIcon className="size-6 text-destructive" />
												)}
											</div>
										)}
									</div>
									<div className="p-3">
										<span className="block truncate text-sm">{asset.filename}</span>
									</div>
									<button
										type="button"
										onClick={openContextMenu}
										aria-label="More actions"
										className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
									>
										<MoreVerticalIcon className="size-4" />
									</button>
								</div>
							</ContextMenuTrigger>
							<AssetContextMenuContent
								asset={asset}
								projectId={projectId}
								base={base}
								onRename={() =>
									setRenameTarget({
										name: asset.filename,
										endpoint: `${base}/assets/${asset.id}`,
										bodyKey: "filename",
									})
								}
								onDownloadAs={() => setDownloadAsTarget(asset)}
								onCopyLink={() => handleCopyLink(asset)}
								onDetails={() => setDetailsTarget(asset)}
								onEmbed={() => setEmbedTarget(asset)}
								onAddSubtitle={() => setAddSubtitleTarget(asset)}
								onAddAudioTrack={() => setAddAudioTrackTarget(asset)}
								onDuplicate={() => duplicateAssetAndRefresh(asset.id)}
								onMoveTo={onMoveTo}
								onTrash={() => trashAssetAndRefresh(asset.id)}
							/>
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

			{copyLinkTarget && (
				<CopyLinkDialog
					orgId={orgId}
					projectId={projectId}
					asset={copyLinkTarget}
					open={Boolean(copyLinkTarget)}
					onOpenChange={(open) => {
						if (!open) setCopyLinkTarget(null);
					}}
				/>
			)}

			{detailsTarget && (
				<AssetDetailsPanel
					orgId={orgId}
					projectId={projectId}
					asset={detailsTarget}
					open={Boolean(detailsTarget)}
					onOpenChange={(open) => {
						if (!open) setDetailsTarget(null);
					}}
				/>
			)}

			{embedTarget && (
				<EmbedDialog
					orgId={orgId}
					projectId={projectId}
					projectVisibility={projectVisibility}
					asset={embedTarget}
					open={Boolean(embedTarget)}
					onOpenChange={(open) => {
						if (!open) setEmbedTarget(null);
					}}
				/>
			)}

			{addSubtitleTarget && (
				<AddSubtitleDialog
					orgId={orgId}
					projectId={projectId}
					asset={addSubtitleTarget}
					open={Boolean(addSubtitleTarget)}
					onOpenChange={(open) => {
						if (!open) setAddSubtitleTarget(null);
					}}
					onAdded={onRefresh}
				/>
			)}

			{addAudioTrackTarget && (
				<AddAudioTrackDialog
					orgId={orgId}
					projectId={projectId}
					asset={addAudioTrackTarget}
					open={Boolean(addAudioTrackTarget)}
					onOpenChange={(open) => {
						if (!open) setAddAudioTrackTarget(null);
					}}
					onAdded={onRefresh}
				/>
			)}
		</div>
	);
}

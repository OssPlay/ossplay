"use client";

import {
	ArrowDownIcon,
	ArrowUpIcon,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { RenameTarget, useDriveActions } from "@/hooks/use-drive-actions";
import type { DriveSelection } from "@/hooks/use-drive-selection";
import useURL from "@/hooks/use-url";
import { formatBytes } from "@/lib/format-bytes";
import { cn, formatDatetime } from "@/lib/utils";
import type { DriveAsset, DriveFolder } from "@/types/drive";
import { DownloadAsDialog } from "./download-as-dialog";
import { PreviewOverlay } from "./preview-overlay";
import { RenameDialog } from "./rename-dialog";

const DRAG_MIME = "application/x-drive-items";

// Same `sort`/`order` URL params DriveToolbar's dropdown writes for grid
// view — list view exposes them via clickable column headers instead, same
// indicator pattern as every other sortable DataTable in the app.
function SortableHead({
	sortKey,
	className,
	children,
}: {
	sortKey: string;
	className?: string;
	children: React.ReactNode;
}) {
	const url = useURL();
	const sort = url.getQueryParam("sort") ?? "name";
	const order = url.getQueryParam("order") === "desc" ? "desc" : "asc";
	const active = sort === sortKey;

	function handleClick() {
		if (active) {
			url.setQueryParams({ order: order === "asc" ? "desc" : null, page: null });
		} else {
			url.setQueryParams({ sort: sortKey === "name" ? null : sortKey, order: null, page: null });
		}
	}

	return (
		<TableHead className={className}>
			<button
				type="button"
				onClick={handleClick}
				className="inline-flex items-center gap-1 hover:text-foreground"
			>
				{children}
				{active &&
					(order === "desc" ? (
						<ArrowDownIcon className="size-3.5" />
					) : (
						<ArrowUpIcon className="size-3.5" />
					))}
			</button>
		</TableHead>
	);
}

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

// Row-oriented counterpart to DriveGrid, built on the same `Table`
// primitives every DataTable page uses (visual consistency only — this
// stays its own component rather than `DataTable` itself, since folders+
// assets are two item types sharing one row list, plus drag-move/marquee-
// select/context-menu, none of which `DataTable`'s single-envelope,
// page-based contract supports). `ContextMenuTrigger` wraps each row via
// its `render` prop rather than as a child — it renders its own `<div>` by
// default, which isn't valid inside a `<tbody>`.
//
// `selection`/`driveActions`/`onMoveTo` are owned by DriveView (not built
// here) so grid/list toggling doesn't reset selection and both views share
// one `useDriveActions()` instance instead of each duplicating it.
export function DriveList({
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
				className="relative select-none overflow-hidden rounded-md border"
			>
				<Table>
					<TableHeader>
						<TableRow>
							<SortableHead sortKey="name">Name</SortableHead>
							<SortableHead sortKey="size" className="text-right">
								Size
							</SortableHead>
							<SortableHead sortKey="updatedAt" className="text-right">
								Modified
							</SortableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{folders.map((folder) => (
							<ContextMenu key={folder.id}>
								<ContextMenuTrigger
									render={
										<TableRow
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
											tabIndex={0}
											className={cn(
												"cursor-pointer",
												selection.isSelected(folder.id) && "bg-primary/15",
											)}
										/>
									}
								>
									<TableCell className="flex items-center gap-3">
										<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="truncate">{folder.name}</span>
									</TableCell>
									<TableCell className="text-right text-muted-foreground">—</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{formatDatetime(folder.updatedAt)}
									</TableCell>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem
										onClick={() => router.push(`/project/${projectId}/${folder.id}`)}
									>
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
									<ContextMenuTrigger
										render={
											<TableRow
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
												tabIndex={0}
												className={cn(
													"cursor-pointer",
													selection.isSelected(asset.id) && "bg-primary/15",
												)}
											/>
										}
									>
										<TableCell className="flex items-center gap-3">
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
											<span className="truncate">{asset.filename}</span>
											{asset.status !== "ready" && (
												<span className="shrink-0 text-[10px] text-muted-foreground capitalize">
													{asset.status}
												</span>
											)}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{asset.size != null ? formatBytes(asset.size) : "—"}
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{formatDatetime(asset.updatedAt)}
										</TableCell>
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
					</TableBody>
				</Table>

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

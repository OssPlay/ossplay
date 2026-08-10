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
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { DriveAsset, DriveFolder } from "@/types/drive";
import { PreviewOverlay } from "./preview-overlay";
import { RenameDialog } from "./rename-dialog";

interface RenameTarget {
	name: string;
	endpoint: string;
	bodyKey: "name" | "filename";
}

function iconForMimeType(mimeType: string) {
	if (mimeType.startsWith("image/")) return ImageIcon;
	if (mimeType.startsWith("video/")) return FilmIcon;
	if (mimeType.startsWith("audio/")) return MusicIcon;
	if (mimeType === "application/pdf") return FileTextIcon;
	return FileIcon;
}

// Bespoke grid, not DataTable — spatial folder/file mixing, thumbnails, and
// right-click actions don't fit a row-oriented table well (trash/page.tsx
// uses DataTable instead, since a flat restore/delete-forever list fits it
// better).
export function DriveGrid({
	orgId,
	projectId,
	folders,
	assets,
	onRefresh,
}: {
	orgId: string;
	projectId: string;
	folders: DriveFolder[];
	assets: DriveAsset[];
	onRefresh: () => void;
}) {
	const router = useRouter();
	const [previewAsset, setPreviewAsset] = useState<DriveAsset | null>(null);
	const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const base = `/organizations/${orgId}/projects/${projectId}`;

	const trashFolder = useAction(
		(folderId: string) => apiFetch(`${base}/folders/${folderId}/trash`, { method: "POST" }),
		{ success: "Moved to trash", error: "Could not move to trash" },
	);
	const trashAsset = useAction(
		(assetId: string) => apiFetch(`${base}/assets/${assetId}/trash`, { method: "POST" }),
		{ success: "Moved to trash", error: "Could not move to trash" },
	);
	const bulkTrash = useAction(
		() =>
			apiFetch(`${base}/bulk/trash`, {
				method: "POST",
				body: JSON.stringify({
					folderIds: folders.filter((f) => selected.has(f.id)).map((f) => f.id),
					assetIds: assets.filter((a) => selected.has(a.id)).map((a) => a.id),
				}),
			}),
		{ success: "Moved to trash", error: "Could not move selection to trash" },
	);

	function toggleSelected(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function handleBulkTrash() {
		await bulkTrash
			.trigger()
			.then(() => {
				setSelected(new Set());
				onRefresh();
			})
			.catch(() => {});
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
			{selected.size > 0 && (
				<div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
					<span className="text-sm">{selected.size} selected</span>
					<button
						type="button"
						onClick={handleBulkTrash}
						disabled={bulkTrash.isLoading}
						className="ml-auto flex items-center gap-1 text-sm text-destructive hover:underline"
					>
						<Trash2Icon className="size-3.5" /> Move to trash
					</button>
				</div>
			)}

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{folders.map((folder) => (
					<ContextMenu key={folder.id}>
						<ContextMenuTrigger>
							<div className="group relative flex flex-col items-center gap-2 rounded-lg border p-3 hover:bg-muted/50">
								<Checkbox
									checked={selected.has(folder.id)}
									onCheckedChange={() => toggleSelected(folder.id)}
									onClick={(e) => e.stopPropagation()}
									className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
								/>
								<button
									type="button"
									onClick={() => router.push(`/project/${projectId}/${folder.id}`)}
									className="flex flex-col items-center gap-2"
								>
									<FolderIcon className="size-10 text-muted-foreground" />
									<span className="max-w-full truncate text-sm">{folder.name}</span>
								</button>
							</div>
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
							<ContextMenuItem
								variant="destructive"
								onClick={() =>
									trashFolder
										.trigger(folder.id)
										.then(onRefresh)
										.catch(() => {})
								}
							>
								Move to trash
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				))}

				{assets.map((asset) => {
					const Icon = iconForMimeType(asset.mimeType);
					const contentUrl = `/api${base}/assets/${asset.id}/content`;
					return (
						<ContextMenu key={asset.id}>
							<ContextMenuTrigger>
								<div className="group relative flex flex-col items-center gap-2 rounded-lg border p-3 hover:bg-muted/50">
									<Checkbox
										checked={selected.has(asset.id)}
										onCheckedChange={() => toggleSelected(asset.id)}
										onClick={(e) => e.stopPropagation()}
										className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
									/>
									<button
										type="button"
										onClick={() => setPreviewAsset(asset)}
										className="flex flex-col items-center gap-2"
									>
										<Icon className="size-10 text-muted-foreground" />
										<span className="max-w-full truncate text-sm">{asset.filename}</span>
										{asset.status !== "ready" && (
											<span className="text-[10px] text-muted-foreground capitalize">
												{asset.status}
											</span>
										)}
									</button>
								</div>
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
								<ContextMenuItem
									variant="destructive"
									onClick={() =>
										trashAsset
											.trigger(asset.id)
											.then(onRefresh)
											.catch(() => {})
									}
								>
									Move to trash
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					);
				})}
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
		</div>
	);
}

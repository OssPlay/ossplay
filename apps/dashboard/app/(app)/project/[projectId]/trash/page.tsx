"use client";

import { FileIcon, FolderIcon, Trash2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { TrashRowActions } from "@/components/drive/trash-row-actions";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import { useProjectContext } from "@/lib/current-project";
import type { DriveAsset, DriveFolder } from "@/types/drive";

// Plain Table, not DataTable/useServerTable — GET .../trash returns two
// unpaginated arrays (folders + assets), not the one-row-type paginated
// shape that abstraction is built for; a flat, rarely-large recycle-bin
// listing doesn't need it.
export default function ProjectTrashPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const { effectiveOrgId } = useProjectContext(projectId);
	const base = `/organizations/${effectiveOrgId}/projects/${projectId}`;

	const { data, mutate, isLoading } = useSWR<{ folders: DriveFolder[]; assets: DriveAsset[] }>(
		effectiveOrgId ? `${base}/trash` : null,
	);

	const restoreFolder = useAction(
		(id: string) => apiFetch(`${base}/folders/${id}/restore`, { method: "POST" }),
		{ success: "Restored", error: "Could not restore" },
	);
	const restoreAsset = useAction(
		(id: string) => apiFetch(`${base}/assets/${id}/restore`, { method: "POST" }),
		{ success: "Restored", error: "Could not restore" },
	);
	const deleteFolderForever = useAction(
		(id: string) => apiFetch(`${base}/folders/${id}`, { method: "DELETE" }),
		{ success: "Permanently deleted", error: "Could not delete" },
	);
	const deleteAssetForever = useAction(
		(id: string) => apiFetch(`${base}/assets/${id}`, { method: "DELETE" }),
		{ success: "Permanently deleted", error: "Could not delete" },
	);
	const emptyTrash = useAction(() => apiFetch(`${base}/trash/empty`, { method: "POST" }), {
		success: "Trash emptied",
		error: "Could not empty trash",
	});

	if (!effectiveOrgId) return null;
	if (isLoading) return <ContainerSkeleton size="lg" rows={4} />;

	const folders = data?.folders ?? [];
	const assets = data?.assets ?? [];
	const isEmpty = folders.length === 0 && assets.length === 0;

	return (
		<Container
			header={{
				icon: Trash2Icon,
				title: "Trash",
				description: "Items are permanently deleted after 30 days.",
				action:
					folders.length + assets.length > 0
						? {
								icon: Trash2Icon,
								title: "Empty trash",
								variant: "destructive",
								onClick: () =>
									emptyTrash
										.trigger()
										.then(() => mutate())
										.catch(() => {}),
							}
						: undefined,
			}}
			size="lg"
		>
			{isEmpty ? (
				<p className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Trashed</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{folders.map((folder) => (
							<TableRow key={folder.id}>
								<TableCell className="flex items-center gap-2">
									<FolderIcon className="size-4 text-muted-foreground" /> {folder.name}
								</TableCell>
								<TableCell className="text-muted-foreground">Folder</TableCell>
								<TableCell className="text-muted-foreground">
									{folder.deletedAt ? new Date(folder.deletedAt).toLocaleString() : "—"}
								</TableCell>
								<TableCell className="text-right">
									<TrashRowActions
										onRestore={() =>
											restoreFolder
												.trigger(folder.id)
												.then(() => mutate())
												.catch(() => {})
										}
										onDeleteForever={() =>
											deleteFolderForever
												.trigger(folder.id)
												.then(() => mutate())
												.catch(() => {})
										}
										label={folder.name}
									/>
								</TableCell>
							</TableRow>
						))}
						{assets.map((asset) => (
							<TableRow key={asset.id}>
								<TableCell className="flex items-center gap-2">
									<FileIcon className="size-4 text-muted-foreground" /> {asset.filename}
								</TableCell>
								<TableCell className="text-muted-foreground">File</TableCell>
								<TableCell className="text-muted-foreground">
									{asset.deletedAt ? new Date(asset.deletedAt).toLocaleString() : "—"}
								</TableCell>
								<TableCell className="text-right">
									<TrashRowActions
										onRestore={() =>
											restoreAsset
												.trigger(asset.id)
												.then(() => mutate())
												.catch(() => {})
										}
										onDeleteForever={() =>
											deleteAssetForever
												.trigger(asset.id)
												.then(() => mutate())
												.catch(() => {})
										}
										label={asset.filename}
									/>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Container>
	);
}

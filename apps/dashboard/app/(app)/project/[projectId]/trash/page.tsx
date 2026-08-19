"use client";

import { FileIcon, FolderIcon, Trash2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { TrashRowActions } from "@/components/drive/trash-row-actions";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
	const { instance } = useAuth();
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
				learnMore: instance?.docsUrl ? { href: `${instance.docsUrl}/guides/drive` } : undefined,
				// A plain header.action fires immediately on click — too easy to
				// trigger by accident for something this irreversible, unlike the
				// per-row "Delete forever" (trash-row-actions.tsx), which already
				// confirms via ConfirmDialog. header.extra lets this one confirm too.
				extra:
					folders.length + assets.length > 0 ? (
						<ConfirmDialog
							trigger={
								<Button variant="destructive" size="sm">
									<Trash2Icon /> Empty trash
								</Button>
							}
							title="Empty trash?"
							description={`This permanently deletes ${folders.length + assets.length} item${
								folders.length + assets.length === 1 ? "" : "s"
							} — this can't be undone.`}
							confirmLabel="Empty trash"
							loading={emptyTrash.isLoading}
							onConfirm={() => emptyTrash.trigger().then(() => mutate())}
						/>
					) : undefined,
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
								<TableCell className="flex max-w-80 items-center gap-2">
									<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 truncate" title={folder.name}>
										{folder.name}
									</span>
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
										restoring={restoreFolder.isLoading}
										onDeleteForever={() =>
											deleteFolderForever.trigger(folder.id).then(() => mutate())
										}
										deleting={deleteFolderForever.isLoading}
										label={folder.name}
									/>
								</TableCell>
							</TableRow>
						))}
						{assets.map((asset) => (
							<TableRow key={asset.id}>
								<TableCell className="flex max-w-80 items-center gap-2">
									<FileIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 truncate" title={asset.filename}>
										{asset.filename}
									</span>
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
										restoring={restoreAsset.isLoading}
										onDeleteForever={() =>
											deleteAssetForever.trigger(asset.id).then(() => mutate())
										}
										deleting={deleteAssetForever.isLoading}
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

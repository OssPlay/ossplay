"use client";

import { toast } from "sonner";
import { useTransfer } from "@/components/providers/transfer-provider";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { DriveAsset, DriveFolder } from "@/types/drive";

export interface RenameTarget {
	name: string;
	endpoint: string;
	bodyKey: "name" | "filename";
}

// Shared mutation layer for DriveGrid and DriveList — trash/bulk-trash today,
// move/duplicate/download land here in later phases — written once so both
// views stay behaviorally identical instead of copy-pasted.
export function useDriveActions({
	orgId,
	projectId,
	folders,
	assets,
	selected,
	onRefresh,
}: {
	orgId: string;
	projectId: string;
	folders: DriveFolder[];
	assets: DriveAsset[];
	selected: Set<string>;
	onRefresh: () => void;
}) {
	const base = `/organizations/${orgId}/projects/${projectId}`;
	const transfer = useTransfer();

	// No built-in success toast on any of the trash actions below —
	// useAction's `success` option can only show a plain string, and undo
	// needs an action button, so trashFolderAndRefresh/trashAssetAndRefresh/
	// the bulk-trash handler in DriveView show it manually instead (see
	// their own comments). A failure still gets useAction's normal toast.
	const trashFolder = useAction(
		(folderId: string) => apiFetch(`${base}/folders/${folderId}/trash`, { method: "POST" }),
		{ error: "Could not move to trash" },
	);
	const trashAsset = useAction(
		(assetId: string) => apiFetch(`${base}/assets/${assetId}/trash`, { method: "POST" }),
		{ error: "Could not move to trash" },
	);
	const bulkTrash = useAction(
		(payload: { folderIds: string[]; assetIds: string[] }) =>
			apiFetch(`${base}/bulk/trash`, { method: "POST", body: JSON.stringify(payload) }),
		{ error: "Could not move selection to trash" },
	);
	// Same reasoning — no success toast of their own, since these back the
	// "Undo" action on the trash toasts; a failed undo still gets one so
	// it isn't silent.
	const restoreFolder = useAction(
		(folderId: string) => apiFetch(`${base}/folders/${folderId}/restore`, { method: "POST" }),
		{ error: "Could not restore" },
	);
	const restoreAsset = useAction(
		(assetId: string) => apiFetch(`${base}/assets/${assetId}/restore`, { method: "POST" }),
		{ error: "Could not restore" },
	);
	const bulkRestore = useAction(
		(payload: { folderIds: string[]; assetIds: string[] }) =>
			apiFetch(`${base}/bulk/restore`, { method: "POST", body: JSON.stringify(payload) }),
		{ error: "Could not restore" },
	);

	const moveAsset = useAction(
		({ assetId, folderId }: { assetId: string; folderId: string | null }) =>
			apiFetch(`${base}/assets/${assetId}`, {
				method: "PATCH",
				body: JSON.stringify({ folderId }),
			}),
		{ success: "Moved", error: "Could not move" },
	);
	const moveFolder = useAction(
		({ folderId, parentId }: { folderId: string; parentId: string | null }) =>
			apiFetch(`${base}/folders/${folderId}`, {
				method: "PATCH",
				body: JSON.stringify({ parentId }),
			}),
		{ success: "Moved", error: "Could not move" },
	);
	const bulkMove = useAction(
		(payload: { folderIds: string[]; assetIds: string[]; targetFolderId: string | null }) =>
			apiFetch(`${base}/bulk/move`, { method: "POST", body: JSON.stringify(payload) }),
		{ success: "Moved", error: "Could not move selection" },
	);
	const duplicateAsset = useAction(
		(assetId: string) => apiFetch(`${base}/assets/${assetId}/duplicate`, { method: "POST" }),
		{ success: "Copied", error: "Could not copy" },
	);
	const bulkDownload = useAction(
		(payload: { folderIds: string[]; assetIds: string[] }) =>
			apiFetch<{ downloadId: string }>(`${base}/bulk/download`, {
				method: "POST",
				body: JSON.stringify(payload),
			}),
		{ error: "Could not prepare that download" },
	);

	function trashFolderAndRefresh(folderId: string) {
		return trashFolder
			.trigger(folderId)
			.then(() => {
				onRefresh();
				toast.success("Moved to trash", {
					action: {
						label: "Undo",
						onClick: () => restoreFolder.trigger(folderId).then(onRefresh),
					},
				});
			})
			.catch(() => {});
	}

	function trashAssetAndRefresh(assetId: string) {
		return trashAsset
			.trigger(assetId)
			.then(() => {
				onRefresh();
				toast.success("Moved to trash", {
					action: {
						label: "Undo",
						onClick: () => restoreAsset.trigger(assetId).then(onRefresh),
					},
				});
			})
			.catch(() => {});
	}

	// Captures the exact set of ids being trashed (rather than re-reading
	// `selected` later) so the undo action restores precisely what this
	// call trashed, even if the selection has since changed.
	function bulkTrashAndRefresh() {
		const folderIds = folders.filter((f) => selected.has(f.id)).map((f) => f.id);
		const assetIds = assets.filter((a) => selected.has(a.id)).map((a) => a.id);
		if (folderIds.length + assetIds.length === 0) return Promise.resolve();
		return bulkTrash
			.trigger({ folderIds, assetIds })
			.then(() => {
				onRefresh();
				const count = folderIds.length + assetIds.length;
				toast.success(count === 1 ? "Moved to trash" : `Moved ${count} items to trash`, {
					action: {
						label: "Undo",
						onClick: () => bulkRestore.trigger({ folderIds, assetIds }).then(onRefresh),
					},
				});
			})
			.catch(() => {});
	}

	// Moves whichever of `ids` are real folders/assets in the current
	// listing to `targetFolderId` — a single item uses the plain PATCH
	// endpoints, more than one uses bulk/move, so a drag of an unselected
	// single card doesn't pay the bulk-endpoint's per-item overhead.
	async function moveItemsAndRefresh(ids: Set<string>, targetFolderId: string | null) {
		const folderIds = folders.filter((f) => ids.has(f.id)).map((f) => f.id);
		const assetIds = assets.filter((a) => ids.has(a.id)).map((a) => a.id);
		if (folderIds.length + assetIds.length === 0) return;

		if (folderIds.length === 1 && assetIds.length === 0) {
			await moveFolder
				.trigger({ folderId: folderIds[0], parentId: targetFolderId })
				.then(onRefresh)
				.catch(() => {});
			return;
		}
		if (assetIds.length === 1 && folderIds.length === 0) {
			await moveAsset
				.trigger({ assetId: assetIds[0], folderId: targetFolderId })
				.then(onRefresh)
				.catch(() => {});
			return;
		}
		await bulkMove
			.trigger({ folderIds, assetIds, targetFolderId })
			.then(onRefresh)
			.catch(() => {});
	}

	function duplicateAssetAndRefresh(assetId: string) {
		return duplicateAsset
			.trigger(assetId)
			.then(onRefresh)
			.catch(() => {});
	}

	// The zip itself streams back via a plain GET (window navigation gives
	// real browser download progress, no fetch()-then-blob double-buffer —
	// see the plan's decision #8), so this only needs to resolve the
	// selection into a ticket and hand off. Only the ticket-creation step is
	// tracked in the transfer popover (with retry) — per the confirmed scope,
	// the actual transfer stays a native browser download with no in-app
	// byte progress, to avoid buffering potentially large zips in memory.
	async function downloadSelectionAndOpen(ids: Set<string>) {
		const folderIds = folders.filter((f) => ids.has(f.id)).map((f) => f.id);
		const assetIds = assets.filter((a) => ids.has(a.id)).map((a) => a.id);
		const total = folderIds.length + assetIds.length;
		if (total === 0) return;

		const taskId = crypto.randomUUID();
		async function run() {
			transfer.updateTask(taskId, { status: "active", error: undefined });
			try {
				const { downloadId } = await bulkDownload.trigger({ folderIds, assetIds });
				transfer.updateTask(taskId, { status: "done" });
				window.location.href = `/api${base}/bulk/download/${downloadId}`;
			} catch {
				transfer.updateTask(taskId, {
					status: "error",
					error: "Could not prepare that download",
				});
			}
		}
		transfer.addTask({
			id: taskId,
			kind: "download",
			label: total === 1 ? "Preparing 1 item" : `Preparing ${total} items`,
			status: "active",
			retry: run,
		});
		await run();
	}

	// Public-project case only — a permanent /v1 URL, no key needed, works
	// for anyone (not just someone logged into this dashboard). The private
	// case needs a signing-duration choice first, so it's handled by
	// CopyLinkDialog instead of this fire-and-forget helper.
	async function copyPublicLink(assetId: string) {
		const url = `${window.location.origin}/api/v1/${projectId}/${assetId}`;
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Link copied");
		} catch {
			toast.error("Could not copy link");
		}
	}

	return {
		base,
		trashFolder,
		trashAsset,
		bulkTrash,
		restoreFolder,
		restoreAsset,
		bulkRestore,
		trashFolderAndRefresh,
		trashAssetAndRefresh,
		bulkTrashAndRefresh,
		moveItemsAndRefresh,
		duplicateAsset,
		duplicateAssetAndRefresh,
		bulkDownload,
		downloadSelectionAndOpen,
		copyPublicLink,
	};
}

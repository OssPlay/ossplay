"use client";

import { type DragEvent, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { useTransfer } from "@/components/providers/transfer-provider";
import { beginAction, endAction } from "@/lib/action-store";
import { apiFetch } from "@/lib/api";
import { uploadToTarget } from "@/lib/drive-upload";

type FileWithRelativePath = File & { webkitRelativePath?: string };

interface CreatedUploadItem {
	relativePath: string;
	filename: string;
	assetId: string;
	uploadTarget: string;
}

export interface UploadZoneHandle {
	openFilePicker: () => void;
	openFolderPicker: () => void;
}

// Drag-drop only handles flat files (no recursive directory traversal via
// DataTransferItem.webkitGetAsEntry) — the folder picker triggered via
// `openFolderPicker` is the supported way to upload a whole tree, via a
// plain `<input webkitdirectory>`, which already hands back each File's
// full relative path with no extra traversal code needed. Flagged as a
// scope simplification, not an oversight.
//
// Wraps `children` (the grid/list) as the actual drop target and file-picker
// triggers instead of rendering its own boxed button row — the file-manager
// picks up drag-and-drop over the content it's already looking at, and the
// two "Upload…" triggers live in the page's Container header instead
// (imperative handle below), so there's no permanently-visible upload chrome
// competing with the file list for space.
export const UploadZone = forwardRef<
	UploadZoneHandle,
	{
		orgId: string;
		projectId: string;
		folderId: string | null;
		onUploaded: () => void;
		children: React.ReactNode;
	}
>(function UploadZone({ orgId, projectId, folderId, onUploaded, children }, ref) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const [dragActive, setDragActive] = useState(false);
	const transfer = useTransfer();

	useImperativeHandle(ref, () => ({
		openFilePicker: () => fileInputRef.current?.click(),
		openFolderPicker: () => folderInputRef.current?.click(),
	}));

	// Tracked in the global transfer popover (not local state) so progress
	// survives navigating away from this view entirely — the request/
	// upload/confirm sequence itself is unchanged, just reusable for retry.
	async function runFlatUpload(taskId: string, file: File) {
		transfer.updateTask(taskId, { status: "active", progress: 0, error: undefined });
		try {
			const { assetId, uploadTarget } = await apiFetch<{
				assetId: string;
				uploadTarget: string;
			}>(`/organizations/${orgId}/projects/${projectId}/uploads`, {
				method: "POST",
				body: JSON.stringify({
					folderId,
					filename: file.name,
					mimeType: file.type || "application/octet-stream",
					size: file.size,
				}),
			});
			await uploadToTarget(uploadTarget, file, (fraction) =>
				transfer.updateTask(taskId, { progress: fraction }),
			);
			await apiFetch(`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/confirm`, {
				method: "POST",
			});
			transfer.updateTask(taskId, { status: "done", progress: 1 });
			onUploaded();
		} catch (err) {
			transfer.updateTask(taskId, {
				status: "error",
				error: err instanceof Error ? err.message : "Upload failed",
			});
		}
	}

	async function uploadFlatFiles(files: File[]) {
		if (files.length === 0) return;
		// Not routed through useAction — it models one mutation with one
		// loading/error slot, but this is N concurrent uploads each with its
		// own progress/error UI (tracked via the transfer popover). Still joins
		// the same action-lock useAction uses internally, so an in-flight
		// upload blocks logout/tab-close like any other mutation.
		const lockId = crypto.randomUUID();
		beginAction(lockId, "Uploading files");
		try {
			await Promise.all(
				files.map((file) => {
					const taskId = crypto.randomUUID();
					transfer.addTask({
						id: taskId,
						kind: "upload",
						label: file.name,
						status: "active",
						progress: 0,
						retry: () => runFlatUpload(taskId, file),
					});
					return runFlatUpload(taskId, file);
				}),
			);
		} finally {
			endAction(lockId);
		}
	}

	async function runFolderUpload(taskId: string, file: File, createdItem: CreatedUploadItem) {
		transfer.updateTask(taskId, { status: "active", progress: 0, error: undefined });
		try {
			await uploadToTarget(createdItem.uploadTarget, file, (fraction) =>
				transfer.updateTask(taskId, { progress: fraction }),
			);
			await apiFetch(
				`/organizations/${orgId}/projects/${projectId}/assets/${createdItem.assetId}/confirm`,
				{ method: "POST" },
			);
			transfer.updateTask(taskId, { status: "done", progress: 1 });
			onUploaded();
		} catch (err) {
			transfer.updateTask(taskId, {
				status: "error",
				error: err instanceof Error ? err.message : "Upload failed",
			});
		}
	}

	async function uploadFolderFiles(fileList: FileList) {
		const files = Array.from(fileList) as FileWithRelativePath[];
		if (files.length === 0) return;

		const items = files.map((file) => {
			const relPath = file.webkitRelativePath || file.name;
			const segments = relPath.split("/");
			return {
				file,
				relativePath: segments.slice(0, -1).join("/"),
				filename: segments[segments.length - 1] as string,
			};
		});

		// No transfer task exists yet at this point (they're created below,
		// one per item this call returns) — a failure here has nothing to
		// attach a retry to, so it surfaces as a toast instead, the same way
		// any other standalone mutation in this app reports failure.
		let created: CreatedUploadItem[];
		try {
			const response = await apiFetch<{ items: CreatedUploadItem[] }>(
				`/organizations/${orgId}/projects/${projectId}/uploads/batch`,
				{
					method: "POST",
					body: JSON.stringify({
						folderId,
						items: items.map(({ file, relativePath, filename }) => ({
							relativePath,
							filename,
							mimeType: file.type || "application/octet-stream",
							size: file.size,
						})),
					}),
				},
			);
			created = response.items;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not start folder upload");
			return;
		}

		await Promise.all(
			created.flatMap((createdItem, index) => {
				const file = items[index]?.file;
				if (!file) return [];
				const taskId = crypto.randomUUID();
				transfer.addTask({
					id: taskId,
					kind: "upload",
					label: `${createdItem.relativePath}/${createdItem.filename}`,
					status: "active",
					progress: 0,
					retry: () => runFolderUpload(taskId, file, createdItem),
				});
				return [runFolderUpload(taskId, file, createdItem)];
			}),
		);
	}

	function handleDrop(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		setDragActive(false);
		void uploadFlatFiles(Array.from(e.dataTransfer.files));
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drag-drop file zone has no equivalent semantic ARIA role — the header's "Upload…" buttons remain the accessible way to trigger an upload.
		<div
			onDragOver={(e) => {
				e.preventDefault();
				setDragActive(true);
			}}
			onDragLeave={() => setDragActive(false)}
			onDrop={handleDrop}
			className={
				dragActive
					? "rounded-lg border-2 border-dashed border-primary bg-primary/5 -m-2 p-2"
					: "rounded-lg border-2 border-dashed border-transparent -m-2 p-2"
			}
		>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					if (e.target.files) void uploadFlatFiles(Array.from(e.target.files));
					e.target.value = "";
				}}
			/>
			<input
				ref={folderInputRef}
				type="file"
				// @ts-expect-error webkitdirectory isn't in React's input type, but every real browser supports it
				webkitdirectory=""
				className="hidden"
				onChange={(e) => {
					if (e.target.files) void uploadFolderFiles(e.target.files);
					e.target.value = "";
				}}
			/>
			{children}
		</div>
	);
});

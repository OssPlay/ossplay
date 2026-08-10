"use client";

import { FolderUpIcon, UploadIcon, XIcon } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/lib/api";
import { uploadToTarget } from "@/lib/drive-upload";

interface UploadTask {
	id: string;
	filename: string;
	progress: number;
	error?: string;
}

type FileWithRelativePath = File & { webkitRelativePath?: string };

// Drag-drop only handles flat files (no recursive directory traversal via
// DataTransferItem.webkitGetAsEntry) — "Upload folder" below is the
// supported way to upload a whole tree, via a plain
// `<input webkitdirectory>`, which already hands back each File's full
// relative path with no extra traversal code needed. Flagged as a scope
// simplification, not an oversight.
export function UploadZone({
	orgId,
	projectId,
	folderId,
	onUploaded,
}: {
	orgId: string;
	projectId: string;
	folderId: string | null;
	onUploaded: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const folderInputRef = useRef<HTMLInputElement>(null);
	const [tasks, setTasks] = useState<UploadTask[]>([]);
	const [dragActive, setDragActive] = useState(false);

	function addTask(filename: string): string {
		const id = crypto.randomUUID();
		setTasks((prev) => [...prev, { id, filename, progress: 0 }]);
		return id;
	}
	function updateTask(id: string, patch: Partial<UploadTask>) {
		setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	}
	function removeTask(id: string) {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	}

	async function uploadFlatFiles(files: File[]) {
		if (files.length === 0) return;
		await Promise.all(
			files.map(async (file) => {
				const taskId = addTask(file.name);
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
						updateTask(taskId, { progress: fraction }),
					);
					await apiFetch(
						`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/confirm`,
						{
							method: "POST",
						},
					);
					removeTask(taskId);
				} catch (err) {
					updateTask(taskId, { error: err instanceof Error ? err.message : "Upload failed" });
				}
			}),
		);
		onUploaded();
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

		const { items: created } = await apiFetch<{
			items: Array<{
				relativePath: string;
				filename: string;
				assetId: string;
				uploadTarget: string;
			}>;
		}>(`/organizations/${orgId}/projects/${projectId}/uploads/batch`, {
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
		});

		await Promise.all(
			created.map(async (createdItem, index) => {
				const file = items[index]?.file;
				if (!file) return;
				const taskId = addTask(`${createdItem.relativePath}/${createdItem.filename}`);
				try {
					await uploadToTarget(createdItem.uploadTarget, file, (fraction) =>
						updateTask(taskId, { progress: fraction }),
					);
					await apiFetch(
						`/organizations/${orgId}/projects/${projectId}/assets/${createdItem.assetId}/confirm`,
						{ method: "POST" },
					);
					removeTask(taskId);
				} catch (err) {
					updateTask(taskId, { error: err instanceof Error ? err.message : "Upload failed" });
				}
			}),
		);
		onUploaded();
	}

	function handleDrop(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		setDragActive(false);
		void uploadFlatFiles(Array.from(e.dataTransfer.files));
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a drag-drop file zone has no equivalent semantic ARIA role — the buttons below remain the accessible way to trigger an upload.
		<div
			onDragOver={(e) => {
				e.preventDefault();
				setDragActive(true);
			}}
			onDragLeave={() => setDragActive(false)}
			onDrop={handleDrop}
			className={
				dragActive
					? "rounded-lg border-2 border-dashed border-primary bg-primary/5 p-4"
					: "rounded-lg border-2 border-dashed border-transparent p-4"
			}
		>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
					<UploadIcon /> Upload files
				</Button>
				<Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
					<FolderUpIcon /> Upload folder
				</Button>
				<span className="text-xs text-muted-foreground">or drag files here</span>
			</div>
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
			{tasks.length > 0 && (
				<div className="mt-3 flex flex-col gap-2">
					{tasks.map((task) => (
						<div key={task.id} className="flex items-center gap-2 text-sm">
							<span className="w-48 truncate">{task.filename}</span>
							{task.error ? (
								<span className="text-destructive text-xs">{task.error}</span>
							) : (
								<Progress value={task.progress * 100} className="h-1.5 flex-1" />
							)}
							<Button variant="ghost" size="icon-sm" onClick={() => removeTask(task.id)}>
								<XIcon className="size-3.5" />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

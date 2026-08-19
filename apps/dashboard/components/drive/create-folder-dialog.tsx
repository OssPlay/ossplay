"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { useDialogForm } from "@/hooks/use-dialog-form";
import { apiFetch, errorMessage } from "@/lib/api";
import type { DriveFolder } from "@/types/drive";

export function CreateFolderDialog({
	orgId,
	projectId,
	parentId,
	open,
	onOpenChange,
	onCreated,
}: {
	orgId: string;
	projectId: string;
	parentId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (folder: DriveFolder) => void;
}) {
	const [name, setName] = useState("");

	const createFolder = useAction(
		() =>
			apiFetch<{ folder: DriveFolder }>(`/organizations/${orgId}/projects/${projectId}/folders`, {
				method: "POST",
				body: JSON.stringify({ parentId, name }),
			}),
		{ success: (res) => `"${res.folder.name}" created`, error: "Could not create folder" },
	);

	const { handleOpenChange, handleSubmit } = useDialogForm({
		onOpenChange,
		resetFields: () => setName(""),
		action: createFolder,
	});

	function handleCreate() {
		return handleSubmit(
			() => createFolder.trigger(),
			(result) => onCreated(result.folder),
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New folder</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<FormField
						id="newFolderName"
						label="Name"
						value={name}
						onChange={setName}
						autoFocus
						disabled={createFolder.isLoading}
					/>
					<FormError
						message={
							createFolder.error
								? errorMessage(createFolder.error, "Could not create folder")
								: null
						}
					/>
				</div>
				<DialogFooter>
					<LoadingButton
						loading={createFolder.isLoading}
						onClick={handleCreate}
						disabled={!name.trim()}
					>
						Create
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

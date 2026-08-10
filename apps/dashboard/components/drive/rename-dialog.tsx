"use client";

import { useEffect, useState } from "react";
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
import { apiFetch, errorMessage } from "@/lib/api";

// One small rename form, shared by folders and assets (the request body
// shape — `{ name }` vs `{ filename }` — is the only difference, passed in
// by the caller) rather than two near-identical dialogs.
export function RenameDialog({
	open,
	onOpenChange,
	initialName,
	endpoint,
	bodyKey,
	onRenamed,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initialName: string;
	endpoint: string;
	bodyKey: "name" | "filename";
	onRenamed: () => void;
}) {
	const [name, setName] = useState(initialName);

	const rename = useAction(
		() => apiFetch(endpoint, { method: "PATCH", body: JSON.stringify({ [bodyKey]: name }) }),
		{ success: "Renamed", error: "Could not rename" },
	);

	// This dialog stays mounted once and is reopened for whichever item was
	// right-clicked — `open` flips from false to true *externally* (the
	// caller controls it), which never runs through this component's own
	// Dialog onOpenChange callback, only through real user interaction
	// (Escape/overlay-click/Save). Syncing on `open`/`initialName` here is
	// what actually picks up the newly-selected item's name; putting that
	// sync inside the close handler (the usual reset-on-close pattern in
	// this codebase) would never fire for this dialog's open path.
	useEffect(() => {
		if (open) setName(initialName);
	}, [open, initialName]);

	function handleOpenChange(next: boolean) {
		if (!next) rename.reset();
		onOpenChange(next);
	}

	async function handleRename() {
		await rename
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onRenamed();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<FormField
						id="renameField"
						label="Name"
						value={name}
						onChange={setName}
						autoFocus
						disabled={rename.isLoading}
					/>
					<FormError
						message={rename.error ? errorMessage(rename.error, "Could not rename") : null}
					/>
				</div>
				<DialogFooter>
					<LoadingButton
						loading={rename.isLoading}
						onClick={handleRename}
						disabled={!name.trim() || name === initialName}
					>
						Save
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

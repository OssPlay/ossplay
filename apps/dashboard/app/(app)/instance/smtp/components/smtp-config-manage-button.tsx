"use client";

import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { SmtpConfigRow } from "@/types/instance";
import { SmtpConfigDialog } from "./smtp-config-dialog";

export function SmtpConfigManageButton({
	config,
	onChange,
}: {
	config: SmtpConfigRow;
	onChange: () => void;
}) {
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const remove = useAction(() => apiFetch(`/instance/smtp/${config.id}`, { method: "DELETE" }), {
		success: `"${config.name}" deleted`,
		error: "Could not delete config",
	});

	async function handleRemove() {
		await remove
			.trigger()
			.then(() => {
				setDeleteOpen(false);
				onChange();
			})
			.catch(() => {});
	}

	return (
		<>
			<Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
				Manage
			</Button>
			<SmtpConfigDialog
				mode="edit"
				config={config}
				open={editOpen}
				onOpenChange={setEditOpen}
				onSaved={onChange}
			/>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
					Delete
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete "{config.name}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This SMTP config will stop being usable immediately. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isLoading}
							onClick={handleRemove}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

"use client";

import { useState } from "react";
import { FormError } from "@/components/form-error";
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
import { apiFetch, errorMessage } from "@/lib/api";
import type { InstanceUser } from "@/types/instance";

export function DangerZone({ user, onDeleted }: { user: InstanceUser; onDeleted: () => void }) {
	const [open, setOpen] = useState(false);
	const deleteUser = useAction(() => apiFetch(`/instance/users/${user.id}`, { method: "DELETE" }), {
		success: `${user.name} deleted`,
		error: "Could not delete user",
	});

	async function handleDelete() {
		await deleteUser
			.trigger()
			.then(() => {
				setOpen(false);
				onDeleted();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			<FormError
				message={deleteUser.error ? errorMessage(deleteUser.error, "Could not delete user") : null}
			/>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger
					render={
						<Button variant="secondary" className="w-fit">
							Delete user
						</Button>
					}
				/>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the account and removes it from every organization. This
							can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={deleteUser.isLoading} onClick={handleDelete}>
							Delete user
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

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
import type { OrgLike } from "../hooks/use-resolved-org";

export function DeleteOrganization({ org, onDeleted }: { org: OrgLike; onDeleted: () => void }) {
	const [open, setOpen] = useState(false);
	const remove = useAction(() => apiFetch(`/organizations/${org.id}`, { method: "DELETE" }), {
		success: `"${org.name}" deleted`,
		error: "Could not delete organization",
	});

	async function handleDelete() {
		await remove
			.trigger()
			.then(() => {
				setOpen(false);
				onDeleted();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				This permanently deletes{" "}
				{org.projectCount === null
					? "every project"
					: `${org.projectCount} project${org.projectCount === 1 ? "" : "s"}`}
				, every asset, member, and pending invitation in this organization. This can&apos;t be
				undone.
			</p>
			<FormError
				message={remove.error ? errorMessage(remove.error, "Could not delete organization") : null}
			/>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger
					render={
						<Button variant="secondary" className="w-fit">
							Delete organization
						</Button>
					}
				/>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete &quot;{org.name}&quot;?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the organization, its projects, assets, members, and pending
							invitations. This can&apos;t be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={remove.isLoading} onClick={handleDelete}>
							Delete organization
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

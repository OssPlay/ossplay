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
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { ComputeDestinationRow } from "@/types/instance";

// Same Test/Remove shape as RemoteServerRowActions, minus the "Provision
// worker" placeholder — a Lambda function is BYO-deployed by the user
// (there's nothing for OSSPlay to provision), so that button doesn't apply
// here.
export function ComputeDestinationRowActions({
	destination,
	onChange,
}: {
	destination: ComputeDestinationRow;
	onChange: () => void;
}) {
	const [deleteOpen, setDeleteOpen] = useState(false);

	const test = useAction(
		() => apiFetch(`/instance/compute-destinations/${destination.id}/test`, { method: "POST" }),
		{ success: "Connection test triggered", error: "Could not test connection" },
	);
	const remove = useAction(
		() => apiFetch(`/instance/compute-destinations/${destination.id}`, { method: "DELETE" }),
		{ success: `"${destination.label}" removed`, error: "Could not remove destination" },
	);

	async function handleTest() {
		await test
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

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
		<div className="flex justify-end gap-2">
			<LoadingButton variant="secondary" size="sm" loading={test.isLoading} onClick={handleTest}>
				Test
			</LoadingButton>
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
					Remove
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove "{destination.label}"?</AlertDialogTitle>
						<AlertDialogDescription>This can't be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isLoading}
							onClick={handleRemove}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

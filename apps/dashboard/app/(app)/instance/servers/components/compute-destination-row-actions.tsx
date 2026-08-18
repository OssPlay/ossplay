"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

	return (
		<div className="flex justify-end gap-2">
			<LoadingButton variant="secondary" size="sm" loading={test.isLoading} onClick={handleTest}>
				Test
			</LoadingButton>
			<ConfirmDialog
				trigger={
					<Button variant="secondary" size="sm">
						Remove
					</Button>
				}
				title={`Remove "${destination.label}"?`}
				description="This can't be undone."
				loading={remove.isLoading}
				onConfirm={() => remove.trigger().then(onChange)}
			/>
		</div>
	);
}

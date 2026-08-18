"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { RemoteServerRow } from "@/types/instance";

export function RemoteServerRowActions({
	server,
	onChange,
}: {
	server: RemoteServerRow;
	onChange: () => void;
}) {
	const test = useAction(
		() => apiFetch(`/instance/servers/${server.id}/test`, { method: "POST" }),
		{
			success: "Connection test triggered",
			error: "Could not test connection",
		},
	);
	const remove = useAction(() => apiFetch(`/instance/servers/${server.id}`, { method: "DELETE" }), {
		success: `"${server.label}" removed`,
		error: "Could not remove server",
	});

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
			<Tippy content="Coming soon — needs a dedicated worker image that hasn't shipped yet.">
				<span className="inline-block">
					<Button variant="secondary" size="sm" disabled>
						Provision worker
					</Button>
				</span>
			</Tippy>
			<ConfirmDialog
				trigger={
					<Button variant="secondary" size="sm">
						Remove
					</Button>
				}
				title={`Remove "${server.label}"?`}
				description="This can't be undone."
				loading={remove.isLoading}
				onConfirm={() => remove.trigger().then(onChange)}
			/>
		</div>
	);
}

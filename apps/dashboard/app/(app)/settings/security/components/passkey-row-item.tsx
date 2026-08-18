"use client";

import { LoadingButton } from "@/components/ui/loading-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";

export interface PasskeyRow {
	id: string;
	deviceName: string | null;
	createdAt: string;
	lastUsedAt: string | null;
	transports: string[] | null;
}

export function PasskeyRowItem({
	passkey,
	onRemoved,
}: {
	passkey: PasskeyRow;
	onRemoved: () => void;
}) {
	const remove = useAction(() => apiFetch(`/auth/passkey/${passkey.id}`, { method: "DELETE" }), {
		success: `"${passkey.deviceName ?? "Passkey"}" removed`,
		error: "Could not remove passkey",
	});

	async function handleRemove() {
		await remove
			.trigger()
			.then(onRemoved)
			.catch(() => {});
	}

	return (
		<TableRow>
			<TableCell>{passkey.deviceName ?? "Unnamed passkey"}</TableCell>
			<TableCell>{new Date(passkey.createdAt).toLocaleDateString()}</TableCell>
			<TableCell className="text-muted-foreground">
				{passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleDateString() : "Never"}
			</TableCell>
			<TableCell className="text-right">
				<LoadingButton variant="ghost" size="sm" loading={remove.isLoading} onClick={handleRemove}>
					Remove
				</LoadingButton>
			</TableCell>
		</TableRow>
	);
}

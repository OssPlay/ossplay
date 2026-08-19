"use client";

import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { InstanceUser } from "@/types/instance";

export function DangerZone({ user, onDeleted }: { user: InstanceUser; onDeleted: () => void }) {
	const deleteUser = useAction(() => apiFetch(`/instance/users/${user.id}`, { method: "DELETE" }), {
		success: `${user.name} deleted`,
		error: "Could not delete user",
	});

	return (
		<div className="flex flex-col gap-4">
			<FormError
				message={deleteUser.error ? errorMessage(deleteUser.error, "Could not delete user") : null}
			/>
			<ConfirmDialog
				trigger={
					<Button variant="destructive" className="w-fit">
						Delete user
					</Button>
				}
				title={`Delete ${user.name}?`}
				description="This permanently deletes the account and removes it from every organization. This can't be undone."
				confirmLabel="Delete user"
				loading={deleteUser.isLoading}
				onConfirm={() => deleteUser.trigger().then(onDeleted)}
			/>
		</div>
	);
}

"use client";

import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { InstanceUser } from "@/types/instance";

export function SecurityActions({ user, onChange }: { user: InstanceUser; onChange: () => void }) {
	const resetPassword = useAction(
		() =>
			apiFetch<{ temporaryPassword: string }>(`/instance/users/${user.id}/password`, {
				method: "PUT",
				body: JSON.stringify({ generateTemporary: true }),
			}),
		{ error: null },
	);

	const reset2fa = useAction(
		() => apiFetch(`/instance/users/${user.id}/reset-2fa`, { method: "POST" }),
		{ success: "2FA & passkeys reset", error: "Could not reset 2FA" },
	);

	const toggleBlock = useAction(
		() =>
			apiFetch(`/instance/users/${user.id}/${user.disabledAt ? "unblock" : "block"}`, {
				method: "PUT",
			}),
		{
			success: user.disabledAt ? "User unblocked" : "User blocked",
			error: user.disabledAt ? "Could not unblock user" : "Could not block user",
		},
	);

	async function handleToggleBlock() {
		await toggleBlock
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

	const changeRole = useAction(
		(role: "none" | "org_creator") =>
			apiFetch(`/instance/users/${user.id}/role`, {
				method: "PUT",
				body: JSON.stringify({ role: role === "none" ? null : role }),
			}),
		{ success: "Instance role updated", error: "Could not change instance role" },
	);

	return (
		<div className="flex flex-col gap-4">
			{/* Root's own role has no UI to change, by design — see
			instance-users.ts's PUT /:id/role. */}
			{user.instanceRole !== "root" && (
				<div className="flex flex-col gap-1.5 w-fit min-w-48">
					<span className="text-sm font-medium">Instance role</span>
					<Select
						value={user.instanceRole ?? "none"}
						onValueChange={(role) =>
							changeRole
								.trigger(role as "none" | "org_creator")
								.then(onChange)
								.catch(() => {})
						}
						disabled={changeRole.isLoading}
					>
						<SelectTrigger size="sm">
							<SelectValue
								items={{ none: "No instance role", org_creator: "Organization creator" }}
							/>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">No instance role</SelectItem>
							<SelectItem value="org_creator">Organization creator</SelectItem>
						</SelectContent>
					</Select>
				</div>
			)}
			{resetPassword.data ? (
				<p className="text-sm">
					Temporary password (copy now, it won&apos;t be shown again):{" "}
					<span className="font-mono">{resetPassword.data.temporaryPassword}</span>
				</p>
			) : (
				<div className="flex flex-wrap gap-2">
					<LoadingButton
						variant="secondary"
						size="sm"
						loading={resetPassword.isLoading}
						onClick={() => resetPassword.trigger()}
					>
						Reset password
					</LoadingButton>

					{user.totpEnabled || user.passkeyCount > 0 ? (
						<ConfirmDialog
							trigger={
								<Button variant="destructive" size="sm">
									Reset 2FA &amp; passkeys
								</Button>
							}
							title="Reset 2FA & passkeys?"
							description={`${user.name} will lose their authenticator and every registered passkey, and will need to set 2FA up again. This can't be undone.`}
							confirmLabel="Reset 2FA & passkeys"
							loading={reset2fa.isLoading}
							onConfirm={() => reset2fa.trigger().then(onChange)}
						/>
					) : null}

					<LoadingButton
						variant="secondary"
						size="sm"
						loading={toggleBlock.isLoading}
						onClick={handleToggleBlock}
					>
						{user.disabledAt ? "Unblock user" : "Block user"}
					</LoadingButton>
				</div>
			)}
			<FormError
				message={
					resetPassword.error
						? errorMessage(resetPassword.error, "Could not reset password")
						: reset2fa.error
							? errorMessage(reset2fa.error, "Could not reset 2FA")
							: toggleBlock.error
								? errorMessage(toggleBlock.error, "Could not update block status")
								: null
				}
			/>
		</div>
	);
}

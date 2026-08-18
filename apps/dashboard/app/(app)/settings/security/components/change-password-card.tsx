"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

export function ChangePasswordCard() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [success, setSuccess] = useState(false);

	const changePassword = useAction(
		() =>
			apiFetch("/auth/change-password", {
				method: "POST",
				body: JSON.stringify({ currentPassword, newPassword }),
			}),
		{ success: "Password changed", error: null },
	);

	async function handleSubmit() {
		setSuccess(false);
		await changePassword
			.trigger()
			.then(() => {
				setCurrentPassword("");
				setNewPassword("");
				setSuccess(true);
			})
			.catch(() => {});
	}

	return (
		<Container header={{ title: "Password" }} size="sm">
			<div className="flex flex-col gap-4">
				<FormField
					id="currentPassword"
					label="Current password"
					type="password"
					value={currentPassword}
					onChange={setCurrentPassword}
					disabled={changePassword.isLoading}
				/>
				<FormField
					id="newPassword"
					label="New password"
					type="password"
					value={newPassword}
					onChange={setNewPassword}
					minLength={12}
					helpText="At least 12 characters."
					disabled={changePassword.isLoading}
				/>
				<FormError
					message={
						changePassword.error
							? errorMessage(changePassword.error, "Could not change password")
							: null
					}
				/>
				{success && <p className="text-sm text-muted-foreground">Password changed.</p>}
				<LoadingButton
					type="button"
					loading={changePassword.isLoading}
					onClick={handleSubmit}
					disabled={!currentPassword || newPassword.length < 12}
				>
					Change password
				</LoadingButton>
			</div>
		</Container>
	);
}

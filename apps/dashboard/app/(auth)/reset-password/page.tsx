"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type SubmitEvent, Suspense, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

function ResetPasswordForm() {
	const router = useRouter();
	const token = useSearchParams().get("token") ?? "";
	const [newPassword, setNewPassword] = useState("");

	const reset = useAction(
		() =>
			apiFetch("/auth/reset-password", {
				method: "POST",
				body: JSON.stringify({ token, newPassword }),
			}),
		{ error: "Could not reset password" },
	);

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		await reset
			.trigger()
			.then(() => {
				router.push("/");
				router.refresh();
			})
			.catch(() => {});
	}

	if (!token) {
		return <p className="text-sm text-muted-foreground">This reset link is missing its token.</p>;
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<FormField
				id="newPassword"
				label="New password"
				type="password"
				value={newPassword}
				onChange={setNewPassword}
				required
				minLength={12}
				helpText="At least 12 characters."
				disabled={reset.isLoading}
			/>
			<FormError
				message={reset.error ? errorMessage(reset.error, "Could not reset password") : null}
			/>
			<LoadingButton
				type="submit"
				loading={reset.isLoading}
				loadingText="Resetting…"
				disabled={newPassword.length < 12}
			>
				Reset password
			</LoadingButton>
		</form>
	);
}

export default function ResetPasswordPage() {
	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle>Set a new password</CardTitle>
					<CardDescription>This link expires in 1 hour.</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense>
						<ResetPasswordForm />
					</Suspense>
				</CardContent>
			</Card>
		</div>
	);
}

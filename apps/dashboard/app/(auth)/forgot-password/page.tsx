"use client";

import Link from "next/link";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";

// Two recovery methods: email (if this instance has SMTP configured — a
// property of the instance, not the specific account, so it's checked via
// the same public /setup/status the setup/login gate already uses) and
// passkey (its own route, /forgot-password/passkey — a successful passkey
// ceremony is discoverable/usernameless, so it doesn't need an email
// upfront the way the email method does). Recovery codes aren't offered
// here: they only make sense once a password has already been proven, and
// the login flow already handles that case.
export default function ForgotPasswordPage() {
	const { data } = useSWR<{ smtpConfigured: boolean }>("/setup/status");
	const smtpConfigured = data?.smtpConfigured ?? null;
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);

	// The API never reveals whether the email exists either — a failed
	// request still shows the same confirmation, so the toast/error surface
	// useAction would otherwise show is suppressed here on purpose.
	const forgotPassword = useAction(
		() =>
			apiFetch("/auth/forgot-password", {
				method: "POST",
				body: JSON.stringify({ email }),
			}),
		{ error: null },
	);

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		await forgotPassword
			.trigger()
			.catch(() => {})
			.finally(() => setSent(true));
	}

	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle>Reset your password</CardTitle>
					<CardDescription>Choose how you&apos;d like to recover your account.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{sent ? (
						<p className="text-sm text-muted-foreground">
							If that email exists, a reset link has been sent.{" "}
							<Link href="/login" className="underline">
								Back to login
							</Link>
						</p>
					) : (
						<>
							{smtpConfigured && (
								<form onSubmit={handleSubmit} className="flex flex-col gap-4">
									<FormField
										id="email"
										label="Email"
										type="email"
										value={email}
										onChange={setEmail}
										required
										autoFocus
										disabled={forgotPassword.isLoading}
									/>
									<LoadingButton
										type="submit"
										loading={forgotPassword.isLoading}
										loadingText="Sending…"
									>
										Send reset link
									</LoadingButton>
								</form>
							)}
							{smtpConfigured === false && (
								<p className="text-sm text-muted-foreground">
									Email recovery isn&apos;t available on this instance. If you have a passkey, use
									that instead — otherwise, contact your instance administrator.
								</p>
							)}
							<Link
								href="/forgot-password/passkey"
								className="text-center text-sm text-muted-foreground underline"
							>
								Use a passkey instead
							</Link>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

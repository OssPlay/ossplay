"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { type SyntheticEvent, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { getSafeContinuePath } from "@/lib/safe-redirect";

// Only 'totp' is a real value today (TOTP codes and recovery codes both
// verify at the same endpoint/screen) — this route exists as forward-
// compatible plumbing for future 2FA methods, not because multiple exist
// yet. An unrecognized method still renders the same TOTP/recovery-code
// form rather than a dead end, since that's the only challenge the backend
// actually knows how to verify right now.
export default function TwoFactorMethodPage() {
	const { method } = useParams<{ method: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const continuePath = getSafeContinuePath(searchParams.get("continue"));
	const [code, setCode] = useState("");

	const verify = useAction(
		() => apiFetch("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
		{ error: "Invalid code" },
	);

	async function handleVerify(event: SyntheticEvent) {
		event.preventDefault();
		await verify
			.trigger()
			.then(() => {
				router.push(continuePath ?? "/");
				router.refresh();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle>Enter your code</CardTitle>
					<CardDescription>
						{method === "totp"
							? "Enter the code from your authenticator app, or a recovery code."
							: "Enter your verification code."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleVerify} className="flex flex-col gap-4">
						<FormField
							id="code"
							label="Code"
							value={code}
							onChange={setCode}
							required
							autoFocus
							disabled={verify.isLoading}
						/>
						<FormError message={verify.error ? errorMessage(verify.error, "Invalid code") : null} />
						<LoadingButton
							type="submit"
							loading={verify.isLoading}
							loadingText="Verifying…"
							onClick={handleVerify}
							disabled={!code}
						>
							Verify
						</LoadingButton>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

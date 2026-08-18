"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

export function TwoFactorCard() {
	const { user, mutate } = useAuth();
	const totpEnabled = user.totpEnabled;
	const recoveryCodesRemaining = user.recoveryCodesRemaining;
	const onChange = () => mutate();

	const [step, setStep] = useState<"idle" | "setup" | "recovery-codes" | "regenerate">("idle");
	const [code, setCode] = useState("");
	const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
	const [disablePassword, setDisablePassword] = useState("");
	const [disableCode, setDisableCode] = useState("");
	const [showDisable, setShowDisable] = useState(false);
	const [regeneratePassword, setRegeneratePassword] = useState("");

	const setupAction = useAction(
		() => apiFetch<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" }),
		{ error: "Could not start 2FA setup" },
	);
	const confirmAction = useAction(
		() =>
			apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/confirm", {
				method: "POST",
				body: JSON.stringify({ code }),
			}),
		{ error: "Invalid code" },
	);
	const regenerateAction = useAction(
		() =>
			apiFetch<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes/regenerate", {
				method: "POST",
				body: JSON.stringify({ password: regeneratePassword }),
			}),
		{ error: "Could not regenerate recovery codes" },
	);
	const disableAction = useAction(
		() =>
			apiFetch("/auth/2fa/disable", {
				method: "POST",
				body: JSON.stringify({ password: disablePassword, code: disableCode }),
			}),
		{ error: "Could not disable 2FA" },
	);

	async function startSetup() {
		await setupAction
			.trigger()
			.then(() => setStep("setup"))
			.catch(() => {});
	}

	async function confirmSetup() {
		await confirmAction
			.trigger()
			.then((res) => {
				setRecoveryCodes(res.recoveryCodes);
				setStep("recovery-codes");
				setCode("");
			})
			.catch(() => {});
	}

	async function regenerateRecoveryCodes() {
		await regenerateAction
			.trigger()
			.then((res) => {
				setRecoveryCodes(res.recoveryCodes);
				setRegeneratePassword("");
				setStep("recovery-codes");
			})
			.catch(() => {});
	}

	function finishSetup() {
		setStep("idle");
		setRecoveryCodes([]);
		onChange();
	}

	async function disable2fa() {
		await disableAction
			.trigger()
			.then(() => {
				setShowDisable(false);
				setDisablePassword("");
				setDisableCode("");
				onChange();
			})
			.catch(() => {});
	}

	return (
		<Container
			header={{
				title: "Two-factor authentication",
				description: totpEnabled
					? "Enabled — an authenticator code is required to log in."
					: "Not enabled.",
			}}
			size="sm"
		>
			<div className="flex flex-col gap-4">
				{step === "idle" && !totpEnabled && (
					<LoadingButton loading={setupAction.isLoading} onClick={startSetup}>
						Enable 2FA
					</LoadingButton>
				)}

				{step === "setup" && (
					<div className="flex flex-col gap-4">
						<div className="w-fit rounded-lg border border-border bg-white p-3">
							<QRCode value={setupAction.data?.otpauthUrl ?? ""} size={160} />
						</div>
						<p className="text-xs text-muted-foreground break-all">
							{setupAction.data?.otpauthUrl}
						</p>
						<FormField
							id="totpCode"
							label="Enter the 6-digit code from your app"
							value={code}
							onChange={setCode}
							disabled={confirmAction.isLoading}
						/>
						<FormError
							message={
								confirmAction.error ? errorMessage(confirmAction.error, "Invalid code") : null
							}
						/>
						<LoadingButton
							loading={confirmAction.isLoading}
							onClick={confirmSetup}
							disabled={code.length !== 6}
						>
							Confirm
						</LoadingButton>
					</div>
				)}

				{step === "recovery-codes" && (
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Save these recovery codes somewhere safe. Each one can be used once if you lose access
							to your authenticator app. They won&apos;t be shown again.
						</p>
						<ul className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
							{recoveryCodes.map((rc) => (
								<li key={rc}>{rc}</li>
							))}
						</ul>
						<Button onClick={finishSetup}>I&apos;ve saved these codes</Button>
					</div>
				)}

				{step === "idle" && totpEnabled && (
					<p className="text-sm text-muted-foreground">
						{recoveryCodesRemaining} recovery code{recoveryCodesRemaining === 1 ? "" : "s"}{" "}
						remaining.
					</p>
				)}

				{step === "idle" && totpEnabled && (
					<Button variant="outline" onClick={() => setStep("regenerate")}>
						Regenerate recovery codes
					</Button>
				)}

				{step === "regenerate" && (
					<div className="flex flex-col gap-4">
						<FormField
							id="regeneratePassword"
							label="Password"
							type="password"
							value={regeneratePassword}
							onChange={setRegeneratePassword}
							disabled={regenerateAction.isLoading}
						/>
						<FormError
							message={
								regenerateAction.error
									? errorMessage(regenerateAction.error, "Could not regenerate recovery codes")
									: null
							}
						/>
						<div className="flex gap-2">
							<LoadingButton
								loading={regenerateAction.isLoading}
								onClick={regenerateRecoveryCodes}
								disabled={!regeneratePassword}
							>
								Regenerate
							</LoadingButton>
							<Button
								variant="ghost"
								onClick={() => setStep("idle")}
								disabled={regenerateAction.isLoading}
							>
								Cancel
							</Button>
						</div>
					</div>
				)}

				{step === "idle" && totpEnabled && !showDisable && (
					<Button variant="outline" onClick={() => setShowDisable(true)}>
						Disable 2FA
					</Button>
				)}

				{step === "idle" && totpEnabled && showDisable && (
					<div className="flex flex-col gap-4">
						<FormField
							id="disablePassword"
							label="Password"
							type="password"
							value={disablePassword}
							onChange={setDisablePassword}
							disabled={disableAction.isLoading}
						/>
						<FormField
							id="disableCode"
							label="Authenticator or recovery code"
							value={disableCode}
							onChange={setDisableCode}
							disabled={disableAction.isLoading}
						/>
						<FormError
							message={
								disableAction.error
									? errorMessage(disableAction.error, "Could not disable 2FA")
									: null
							}
						/>
						<LoadingButton
							variant="destructive"
							loading={disableAction.isLoading}
							onClick={disable2fa}
							disabled={!disablePassword || !disableCode}
						>
							Confirm disable
						</LoadingButton>
					</div>
				)}
			</div>
		</Container>
	);
}

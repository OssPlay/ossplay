"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { errorMessage } from "@/lib/api";
import { browserSupportsWebAuthn, registerPasskey } from "@/lib/passkey";
import { type PasskeyRow, PasskeyRowItem } from "./passkey-row-item";

export function PasskeysCard() {
	const { data, mutate } = useSWR<{ credentials: PasskeyRow[] }>("/auth/passkey");
	const passkeys = data?.credentials ?? [];
	const [deviceName, setDeviceName] = useState("");
	// Checked after mount, not during render, so the server-rendered HTML
	// matches the client's first render — same reasoning as the /login
	// passkey button.
	const [supported, setSupported] = useState(false);

	useEffect(() => {
		setSupported(browserSupportsWebAuthn());
	}, []);

	const register = useAction(() => registerPasskey(deviceName || undefined), {
		success: "Passkey registered",
		error: "Could not register passkey",
	});

	async function handleRegister() {
		await register
			.trigger()
			.then(() => {
				setDeviceName("");
				mutate();
			})
			.catch(() => {});
	}

	return (
		<Container
			header={{
				title: "Passkeys",
				description:
					"Sign in without a password. A passkey is a full alternative to your password, not a second factor on top of it.",
			}}
			size="sm"
		>
			<div className="flex flex-col gap-4">
				{passkeys.length > 0 && (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Added</TableHead>
								<TableHead>Last used</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{passkeys.map((passkey) => (
								<PasskeyRowItem key={passkey.id} passkey={passkey} onRemoved={() => mutate()} />
							))}
						</TableBody>
					</Table>
				)}

				{supported ? (
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
						<div className="flex-1">
							<FormField
								id="passkeyDeviceName"
								label="Name (optional)"
								value={deviceName}
								onChange={setDeviceName}
								helpText="e.g. “MacBook Touch ID”"
								disabled={register.isLoading}
							/>
						</div>
						<LoadingButton
							type="button"
							loading={register.isLoading}
							loadingText="Waiting for passkey…"
							onClick={handleRegister}
						>
							Add a passkey
						</LoadingButton>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						This browser doesn&apos;t support passkeys.
					</p>
				)}
				<FormError
					message={
						register.error ? errorMessage(register.error, "Could not register passkey") : null
					}
				/>
			</div>
		</Container>
	);
}

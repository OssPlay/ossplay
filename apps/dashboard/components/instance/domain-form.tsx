"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Label } from "@/components/ui/label";
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

type CertProvider = "letsencrypt" | "zerossl" | "custom";

const CERT_PROVIDER_LABELS: Record<CertProvider, string> = {
	letsencrypt: "Let's Encrypt",
	zerossl: "ZeroSSL",
	custom: "Custom ACME directory",
};

type DomainResponse = {
	instanceName: string | null;
	domain: string | null;
	domainConfiguredAt: string | null;
	letsEncryptEmail: string | null;
	certProvider: CertProvider;
	customAcmeUrl: string | null;
};

// Shared by /instance/domain and /onboarding/dns — same fields, same
// PUT /instance/domain call. Caddy's admin API may not be reachable (local
// dev, or any non-Docker-Compose deployment) — caddyApplied surfaces that
// honestly rather than implying a certificate was issued.
export function DomainForm({
	saveLabel = "Save",
	onSaved,
	showInstanceName = true,
}: {
	saveLabel?: string;
	onSaved?: () => void;
	// Onboarding's DNS step is about the domain/TLS only — the instance name
	// field still round-trips through the same PUT so it's never clobbered,
	// it's just not shown as an input there.
	showInstanceName?: boolean;
}) {
	const { user } = useAuth();
	const { data, mutate } = useSWR<DomainResponse>("/instance/domain");
	const [instanceName, setInstanceName] = useState("");
	const [domain, setDomain] = useState("");
	const [letsEncryptEmail, setLetsEncryptEmail] = useState("");
	const [certProvider, setCertProvider] = useState<CertProvider>("letsencrypt");
	const [customAcmeUrl, setCustomAcmeUrl] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	// Seeds the editable fields from the fetched value exactly once — a
	// background SWR revalidation must not stomp on what the user is
	// currently typing.
	const seeded = useRef(false);

	useEffect(() => {
		if (data && !seeded.current) {
			setInstanceName(data.instanceName ?? "");
			setDomain(data.domain ?? "");
			setLetsEncryptEmail(data.letsEncryptEmail ?? user.email);
			setCertProvider(data.certProvider);
			setCustomAcmeUrl(data.customAcmeUrl ?? "");
			seeded.current = true;
		}
	}, [data, user.email]);

	const save = useAction(
		() =>
			apiFetch<{ domain: string | null; caddyApplied: boolean; message: string }>(
				"/instance/domain",
				{
					method: "PUT",
					body: JSON.stringify({
						instanceName: instanceName || null,
						domain: domain || null,
						letsEncryptEmail: letsEncryptEmail || null,
						certProvider,
						customAcmeUrl: certProvider === "custom" ? customAcmeUrl || null : null,
					}),
				},
			),
		{ error: "Could not save domain" },
	);

	async function handleSubmit() {
		setMessage(null);
		await save
			.trigger()
			.then((res) => {
				setMessage(res.message);
				mutate();
				onSaved?.();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			{showInstanceName && (
				<FormField
					id="instanceName"
					label="Instance name"
					value={instanceName}
					onChange={setInstanceName}
					autoComplete="off"
					helpText="e.g. your company name — shown in invite emails sent from this instance."
					disabled={save.isLoading}
				/>
			)}
			<FormField
				id="domain"
				label="Domain"
				value={domain}
				onChange={setDomain}
				autoComplete="off"
				autoFocus
				helpText="e.g. ossplay.example.com — needs to already point at this server."
				disabled={save.isLoading}
			/>
			<FormField
				id="letsEncryptEmail"
				label="ACME contact email"
				type="email"
				value={letsEncryptEmail}
				onChange={setLetsEncryptEmail}
				autoComplete="email"
				helpText="Required once a domain is set — the certificate provider uses this for renewal/expiry notices."
				disabled={save.isLoading}
			/>
			<div className="flex flex-col gap-1.5 w-full">
				<Label className="text-base font-medium text-foreground">Certificate provider</Label>
				<Select
					value={certProvider}
					onValueChange={(value) => setCertProvider(value as CertProvider)}
					disabled={save.isLoading}
				>
					<SelectTrigger className="w-full">
						<SelectValue items={CERT_PROVIDER_LABELS} />
					</SelectTrigger>
					<SelectContent>
						{(Object.keys(CERT_PROVIDER_LABELS) as CertProvider[]).map((provider) => (
							<SelectItem key={provider} value={provider}>
								{CERT_PROVIDER_LABELS[provider]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{certProvider === "custom" && (
				<FormField
					id="customAcmeUrl"
					label="Custom ACME directory URL"
					value={customAcmeUrl}
					onChange={setCustomAcmeUrl}
					autoComplete="off"
					helpText="The ACME directory endpoint your certificate authority publishes."
					disabled={save.isLoading}
				/>
			)}
			<FormError message={save.error ? errorMessage(save.error, "Could not save domain") : null} />
			{message && <p className="text-sm text-muted-foreground">{message}</p>}
			<LoadingButton type="button" loading={save.isLoading} onClick={handleSubmit}>
				{saveLabel}
			</LoadingButton>
			{data?.domain && (
				<p className="text-xs text-muted-foreground">Currently configured: {data.domain}</p>
			)}
		</div>
	);
}

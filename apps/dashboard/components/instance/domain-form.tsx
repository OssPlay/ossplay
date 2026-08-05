"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

// How long (and how often) to poll a newly-configured domain before giving
// up and just showing a manual link — DNS propagation and Let's Encrypt
// issuance are both outside our control, but 2 minutes covers the
// overwhelming majority of real cases (docs/vps-setup.mdx says "up to a
// minute" for the certificate alone).
const REDIRECT_POLL_INTERVAL_MS = 3000;
const REDIRECT_MAX_ATTEMPTS = 40;

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
	const [confirmOpen, setConfirmOpen] = useState(false);
	// Set once a save actually swaps Caddy over to a new domain (see
	// performSave below) — while this is set, the form is replaced by a
	// "waiting to redirect" panel instead of staying interactive, since the
	// current origin is on borrowed time regardless of what the inputs say.
	const [pendingOrigin, setPendingOrigin] = useState<string | null>(null);
	const [pendingTimedOut, setPendingTimedOut] = useState(false);
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

	// Polls the new domain over HTTPS until it actually answers, then does a
	// hard (cross-origin) navigation there — a same-origin router.push can't
	// cross to a different domain, and jumping immediately would frequently
	// land on a connection error: DNS may not have propagated the instant
	// this resolves, and Let's Encrypt issuance for a brand new domain isn't
	// instant either. A resolved fetch (even the opaque response `no-cors`
	// gives us for a cross-origin request) is enough signal the origin is up
	// and TLS is working — we don't need to read the response.
	useEffect(() => {
		if (!pendingOrigin) return;
		let cancelled = false;
		const targetUrl = `https://${pendingOrigin}/`;

		async function poll() {
			for (let attempt = 0; attempt < REDIRECT_MAX_ATTEMPTS; attempt++) {
				if (cancelled) return;
				try {
					const controller = new AbortController();
					const timeout = setTimeout(() => controller.abort(), REDIRECT_POLL_INTERVAL_MS - 200);
					await fetch(targetUrl, { mode: "no-cors", cache: "no-store", signal: controller.signal });
					clearTimeout(timeout);
					if (!cancelled) window.location.href = targetUrl;
					return;
				} catch {
					// Not ready yet — DNS not propagated, cert not issued, connection
					// refused, etc. Keep polling until REDIRECT_MAX_ATTEMPTS.
				}
				await new Promise((resolve) => setTimeout(resolve, REDIRECT_POLL_INTERVAL_MS));
			}
			if (!cancelled) setPendingTimedOut(true);
		}

		void poll();
		return () => {
			cancelled = true;
		};
	}, [pendingOrigin]);

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

	async function performSave() {
		setMessage(null);
		await save
			.trigger()
			.then((res) => {
				setMessage(res.message);
				mutate();
				// A save only actually swaps Caddy's live config to a new domain
				// (apps/api/src/lib/caddy/admin.ts POSTs a full replace) when
				// caddyApplied is true — local dev and any deployment without
				// OSSPLAY_CADDY_ADMIN_URL always no-op there, and this origin
				// keeps working fine. If the saved domain is also the one we're
				// already browsing (re-saving ACME/cert-provider settings without
				// actually changing the hostname), Caddy's reload doesn't disrupt
				// the current connection either — only a genuine hostname change
				// needs the wait-then-redirect treatment.
				if (res.domain && res.caddyApplied && res.domain !== window.location.hostname) {
					setPendingTimedOut(false);
					setPendingOrigin(res.domain);
				} else {
					onSaved?.();
				}
			})
			.catch(() => {});
	}

	// Caddy's live config push (apps/api/src/lib/caddy/admin.ts) is a full
	// replace, not additive — whatever origin is currently reachable (the
	// bootstrap :80 bare-IP config, or a previously-configured domain) stops
	// answering the moment a *different* hostname is saved. Confirm before
	// that happens rather than silently locking someone out of the origin
	// they're currently using, especially if DNS for the new one hasn't
	// actually propagated yet. Comparing against window.location.hostname
	// (not just "was a domain configured before") also catches changing an
	// already-configured domain to a different one, not just the first-ever
	// set — that's the same kind of disruption.
	function handleSubmit() {
		const trimmed = domain.trim();
		if (trimmed && trimmed !== window.location.hostname) {
			setConfirmOpen(true);
			return;
		}
		void performSave();
	}

	// This origin is on borrowed time (or already gone, if Caddy's reload
	// already happened) — swap to a dedicated waiting panel instead of
	// leaving the form interactive with a stale target.
	if (pendingOrigin) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-muted-foreground">
					{pendingTimedOut
						? `Still waiting on https://${pendingOrigin} — DNS may not have propagated yet, or the certificate is taking longer than usual to issue. Keep waiting, or open it directly once you're ready.`
						: `Your instance is now configured at https://${pendingOrigin} — redirecting you there once it answers. Certificate issuance can take up to a minute.`}
				</p>
				{!pendingTimedOut && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2Icon className="size-4 animate-spin" /> Waiting for https://{pendingOrigin}…
					</div>
				)}
				<Button
					type="button"
					variant={pendingTimedOut ? "default" : "outline"}
					render={<a href={`https://${pendingOrigin}`} />}
				>
					Open https://{pendingOrigin} now
				</Button>
			</div>
		);
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
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Switch to {domain}?</AlertDialogTitle>
						<AlertDialogDescription>
							You're currently on{" "}
							{typeof window !== "undefined" ? window.location.hostname : "this address"}. Once{" "}
							{domain} is saved, Caddy serves this instance only at that domain — this address stops
							working, and you'll be redirected there automatically. Make sure {domain} already
							points at this server (DNS can take a while to propagate) before continuing, or you
							could be locked out until it does.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmOpen(false);
								void performSave();
							}}
						>
							Set domain
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

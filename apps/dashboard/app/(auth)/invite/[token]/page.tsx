"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { Me } from "@/types/auth";

type InviteDetails = {
	email: string;
	role: string;
	orgName: string;
	inviterName: string;
	accountExists: boolean;
};

// This page lives under (auth), outside AuthProvider, and is deliberately
// public (proxy.ts's ALWAYS_PUBLIC_PREFIXES) — it has no other way to know
// whether anyone is logged in. A raw fetch, not apiFetch: apiFetch's global
// 401 handler (lib/api.ts's handleSessionExpired) treats any "Unauthorized"
// 401 as a dead session and force-redirects to /login — correct for an
// already-authenticated page whose session died mid-use, wrong here, where
// "nobody is logged in" is the normal default state, not an error.
async function fetchMe(): Promise<Me | null> {
	const res = await fetch("/api/auth/me", { headers: { "Content-Type": "application/json" } });
	if (res.status === 401) return null;
	if (!res.ok) throw new Error("Failed to check the current session");
	return res.json() as Promise<Me>;
}

export default function InvitePage() {
	const { token } = useParams<{ token: string }>();
	const router = useRouter();
	const { data: details, error: lookupError } = useSWR<InviteDetails>(
		`/invitations/token/${token}`,
	);
	// A distinct cache key, not "/auth/me" — that key is also used by
	// AuthProvider's own /auth/me hook elsewhere in the app (a different
	// fetcher, same SWR global cache). Sharing it here meant that returning to
	// this page right after a login redirect (log out and continue -> log in
	// -> router.push back here) could briefly re-show a stale cached value
	// from before the logout, since SWR dedupes repeat requests to the same
	// key within its default 2s window regardless of which fetcher asked.
	const { data: me, isLoading: meLoading } = useSWR<Me | null>(
		"invite-page-session-check",
		fetchMe,
		{
			shouldRetryOnError: false,
			dedupingInterval: 0,
		},
	);
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");

	const accept = useAction(
		() =>
			apiFetch(`/invitations/token/${token}/accept`, {
				method: "POST",
				body: details?.accountExists ? undefined : JSON.stringify({ name, password }),
			}),
		{ error: "Could not accept invitation" },
	);

	const logout = useAction(() => apiFetch("/auth/logout", { method: "POST" }), { error: null });

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		await accept
			.trigger()
			.then(() => {
				router.push("/");
				router.refresh();
			})
			.catch(() => {});
	}

	async function handleLogoutAndContinue() {
		await logout
			.trigger()
			.then(() => {
				router.push(`/login?continue=${encodeURIComponent(`/invite/${token}`)}`);
			})
			.catch(() => {});
	}

	if (lookupError) {
		return (
			<div className="flex flex-1 items-center justify-center bg-card">
				<p className="text-sm text-muted-foreground">This invitation is no longer valid.</p>
			</div>
		);
	}

	// Only block on the session check when it's actually needed (an existing
	// account, where which-user-if-any changes what's shown below) — the
	// new-account signup form doesn't depend on it.
	if (!details || (details.accountExists && meLoading)) return null;

	const loggedInAsCorrectUser =
		details.accountExists && me?.user.email.toLowerCase() === details.email.toLowerCase();
	const loggedInAsWrongUser = details.accountExists && Boolean(me) && !loggedInAsCorrectUser;
	const notLoggedIn = details.accountExists && !me;

	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle>Join {details.orgName}</CardTitle>
					<CardDescription>
						{details.inviterName} invited {details.email} to join as {details.role}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{notLoggedIn && (
						<div className="flex flex-col gap-4">
							<p className="text-sm text-muted-foreground">
								An account already exists for {details.email}. Log in to accept this invitation.
							</p>
							<Link
								href={`/login?continue=${encodeURIComponent(`/invite/${token}`)}`}
								className={buttonVariants()}
							>
								Log in as {details.email}
							</Link>
						</div>
					)}
					{loggedInAsWrongUser && (
						<div className="flex flex-col gap-4">
							<p className="text-sm text-muted-foreground">
								Currently logged in as {me?.user.email}. Log out and continue as {details.email} to
								accept this invitation.
							</p>
							<LoadingButton
								type="button"
								variant="outline"
								loading={logout.isLoading}
								loadingText="Logging out…"
								onClick={handleLogoutAndContinue}
							>
								Log out and continue
							</LoadingButton>
						</div>
					)}
					{!notLoggedIn && !loggedInAsWrongUser && (
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							{!details.accountExists && (
								<>
									<FormField
										id="name"
										label="Your name"
										value={name}
										onChange={setName}
										required
										disabled={accept.isLoading}
									/>
									<FormField
										id="password"
										label="Password"
										type="password"
										value={password}
										onChange={setPassword}
										required
										minLength={12}
										helpText="At least 12 characters."
										disabled={accept.isLoading}
									/>
								</>
							)}
							<FormError
								message={
									accept.error ? errorMessage(accept.error, "Could not accept invitation") : null
								}
							/>
							<LoadingButton type="submit" loading={accept.isLoading} loadingText="Joining…">
								Accept invitation
							</LoadingButton>
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

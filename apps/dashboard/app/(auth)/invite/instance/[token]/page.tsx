"use client";

import { useParams, useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

type InstanceInviteDetails = {
	email: string;
	instanceRole: "root" | "org_creator" | null;
	inviterName: string | null;
	instanceName: string;
};

const ROLE_LABELS: Record<"root" | "org_creator", string> = {
	root: "instance administrator",
	org_creator: "organization creator",
};

// Org-less counterpart to (auth)/invite/[token]/page.tsx — always creates a
// brand-new account (the invite endpoint already rejects an email that
// already has one), so there's no "log in as X" branch to handle here.
export default function InstanceInvitePage() {
	const { token } = useParams<{ token: string }>();
	const router = useRouter();
	const { data: details, error: lookupError } = useSWR<InstanceInviteDetails>(
		`/instance-invitations/token/${token}`,
	);
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");

	const accept = useAction(
		() =>
			apiFetch(`/instance-invitations/token/${token}/accept`, {
				method: "POST",
				body: JSON.stringify({ name, password }),
			}),
		{ error: "Could not accept invitation" },
	);

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		await accept
			.trigger()
			.then(() => {
				router.push("/settings/security");
				router.refresh();
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

	if (!details) return null;

	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle>Join {details.instanceName}</CardTitle>
					<CardDescription>
						{details.inviterName ?? "An instance administrator"} invited {details.email} to join
						{details.instanceRole ? ` as an ${ROLE_LABELS[details.instanceRole]}` : ""}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
						<FormError
							message={
								accept.error ? errorMessage(accept.error, "Could not accept invitation") : null
							}
						/>
						<LoadingButton type="submit" loading={accept.isLoading} loadingText="Joining…">
							Accept invitation
						</LoadingButton>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

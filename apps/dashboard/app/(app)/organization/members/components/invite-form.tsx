"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { CopyableLink } from "@/components/copyable-link";
import { FormError } from "@/components/form-error";
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
import { ROLE_LABELS, ROLES } from "./roles";

export function InviteForm({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("member");
	const [warning, setWarning] = useState<string | null>(null);
	const [inviteUrl, setInviteUrl] = useState<string | null>(null);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string; inviteUrl?: string }>(`/organizations/${orgId}/invitations`, {
				method: "POST",
				body: JSON.stringify({ email, role }),
			}),
		{
			success: (res) =>
				res.warning
					? `Invitation created for "${email}" — email could not be sent`
					: `Invitation sent to "${email}"`,
			error: "Could not send invitation",
		},
	);

	async function handleSubmit() {
		setWarning(null);
		setInviteUrl(null);
		await invite
			.trigger()
			.then((res) => {
				setWarning(res.warning ?? null);
				setInviteUrl(res.warning ? (res.inviteUrl ?? null) : null);
				setEmail("");
				onInvited();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
				<div className="flex-1">
					<FormField
						id="inviteEmail"
						label="Email"
						type="email"
						value={email}
						onChange={setEmail}
						disabled={invite.isLoading}
					/>
				</div>
				<div className="flex flex-col gap-1.5 w-full sm:w-80">
					<Label htmlFor="inviteRole">Role</Label>
					<Select
						defaultValue={ROLES[0]}
						onValueChange={(val) => {
							if (val) setRole(val);
						}}
					>
						<SelectTrigger id="inviteRole" className="w-full">
							<SelectValue items={ROLE_LABELS} />
						</SelectTrigger>
						<SelectContent>
							{ROLES.map((item) => (
								<SelectItem key={item} value={item}>
									{ROLE_LABELS[item]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<LoadingButton
					type="button"
					loading={invite.isLoading}
					onClick={handleSubmit}
					disabled={!email}
				>
					Invite
				</LoadingButton>
			</div>
			<FormError
				message={invite.error ? errorMessage(invite.error, "Could not send invitation") : null}
			/>
			{warning && (
				<div className="flex flex-col gap-2">
					<p className="text-sm text-muted-foreground">{warning} — share the link manually.</p>
					{inviteUrl && <CopyableLink url={inviteUrl} />}
				</div>
			)}
		</div>
	);
}

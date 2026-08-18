"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/auth/form-field";
import { CopyableLink } from "@/components/copyable-link";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { INVITE_ROLE_LABELS } from "./invite-role-labels";

// Org-less: this only provisions a bare account (optionally with an
// instance role) — getting the new user into an org afterward is a separate
// step via that org's own Members page. See instance-users.ts's POST /invite.
export function InviteUserDialog({
	open,
	onOpenChange,
	onInvited,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvited: () => void;
}) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"none" | "org_creator" | "root">("none");
	const [result, setResult] = useState<{ warning?: string; inviteUrl?: string } | null>(null);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string; inviteUrl?: string }>("/instance/users/invite", {
				method: "POST",
				body: JSON.stringify({ email, instanceRole: role === "none" ? null : role }),
			}),
		{ error: null },
	);

	function handleOpenChange(next: boolean) {
		// Reset on close, not open: the "Add user" button that opens this
		// dialog sets `open` directly (bypassing this handler entirely), so a
		// reset-on-open branch never actually runs on that path — the dialog
		// would reopen still showing the previous invite's link. Every close
		// path (Done, Escape, overlay click) does go through this handler,
		// so resetting here covers all of them regardless of how it opened.
		if (!next) {
			setEmail("");
			setRole("none");
			setResult(null);
			invite.reset();
		}
		onOpenChange(next);
	}

	async function handleSubmit() {
		await invite
			.trigger()
			.then((res) => {
				// The invitation row exists either way — refresh the pending list
				// now, not only on the full-success path, or it stays stale until
				// something else happens to revalidate it.
				onInvited();
				if (res.warning) {
					// Email couldn't go out — keep the dialog open with the link so
					// root can copy and share it manually instead of losing it.
					setResult(res);
					return;
				}
				toast.success("Invitation sent");
				handleOpenChange(false);
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add user</DialogTitle>
				</DialogHeader>
				{result ? (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-muted-foreground">{result.warning}</p>
						{result.inviteUrl && <CopyableLink url={result.inviteUrl} />}
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<FormField
							id="inviteUserEmail"
							label="Email"
							type="email"
							value={email}
							onChange={setEmail}
							autoComplete="off"
							autoFocus
							disabled={invite.isLoading}
						/>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="inviteUserRole">Instance role</Label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as "none" | "org_creator" | "root")}
								disabled={invite.isLoading}
							>
								<SelectTrigger id="inviteUserRole" className="w-full">
									<SelectValue items={INVITE_ROLE_LABELS} />
								</SelectTrigger>
								<SelectContent>
									{(Object.keys(INVITE_ROLE_LABELS) as Array<keyof typeof INVITE_ROLE_LABELS>).map(
										(value) => (
											<SelectItem key={value} value={value}>
												{INVITE_ROLE_LABELS[value]}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>
						<FormError
							message={
								invite.error ? errorMessage(invite.error, "Could not create invitation") : null
							}
						/>
					</div>
				)}
				<DialogFooter>
					{result ? (
						<Button type="button" onClick={() => handleOpenChange(false)}>
							Done
						</Button>
					) : (
						<LoadingButton loading={invite.isLoading} disabled={!email} onClick={handleSubmit}>
							Send invite
						</LoadingButton>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

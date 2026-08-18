"use client";

import { CopyIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { OrgInvitation } from "@/types/instance";

export function InvitationRowItem({
	invitation,
	onRevoked,
}: {
	invitation: OrgInvitation;
	onRevoked: () => void;
}) {
	const revoke = useAction(
		() => apiFetch(`/invitations/${invitation.id}/revoke`, { method: "POST" }),
		{
			success: `Invitation to "${invitation.email}" revoked`,
			error: "Could not revoke invitation",
		},
	);

	async function handleRevoke() {
		await revoke
			.trigger()
			.then(onRevoked)
			.catch(() => {});
	}

	async function handleCopy() {
		await navigator.clipboard.writeText(invitation.inviteUrl);
	}

	return (
		<TableRow>
			<TableCell>{invitation.email}</TableCell>
			<TableCell>
				<Badge variant="secondary">{invitation.role}</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{invitation.isExpired ? "Expired" : "Pending"}
			</TableCell>
			<TableCell className="text-right">
				<Tippy content="Copy invite link">
					<Button variant="ghost" size="icon-sm" onClick={handleCopy}>
						<CopyIcon className="size-3.5" />
					</Button>
				</Tippy>
				<LoadingButton variant="ghost" size="sm" loading={revoke.isLoading} onClick={handleRevoke}>
					Revoke
				</LoadingButton>
			</TableCell>
		</TableRow>
	);
}

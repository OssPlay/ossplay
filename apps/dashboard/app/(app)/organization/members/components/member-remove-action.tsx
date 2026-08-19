"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { OrgMember } from "@/types/instance";

export function MemberRemoveAction({
	orgId,
	member,
	isSelf,
	onChanged,
}: {
	orgId: string;
	member: OrgMember;
	isSelf: boolean;
	onChanged: () => void;
}) {
	const remove = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/members/${member.userId}`, {
				method: "DELETE",
			}),
		{
			success: isSelf ? "You left the organization" : `"${member.name}" removed`,
			error: isSelf ? "Could not leave the organization" : "Could not remove member",
		},
	);

	return (
		<ConfirmDialog
			trigger={
				<Button variant="destructive" size="sm">
					{isSelf ? "Leave" : "Remove"}
				</Button>
			}
			title={isSelf ? "Leave this organization?" : `Remove "${member.name}"?`}
			description={
				isSelf
					? "You'll lose access to this organization's projects and settings."
					: "They'll lose access to this organization immediately."
			}
			confirmLabel={isSelf ? "Leave" : "Remove"}
			loading={remove.isLoading}
			onConfirm={() => remove.trigger().then(onChanged)}
		/>
	);
}

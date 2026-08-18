"use client";

import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
	const [open, setOpen] = useState(false);

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

	async function handleRemove() {
		await remove
			.trigger()
			.then(() => {
				setOpen(false);
				onChanged();
			})
			.catch(() => {});
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
				{isSelf ? "Leave" : "Remove"}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{isSelf ? "Leave this organization?" : `Remove "${member.name}"?`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{isSelf
							? "You'll lose access to this organization's projects and settings."
							: "They'll lose access to this organization immediately."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={remove.isLoading}
						onClick={handleRemove}
					>
						{isSelf ? "Leave" : "Remove"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

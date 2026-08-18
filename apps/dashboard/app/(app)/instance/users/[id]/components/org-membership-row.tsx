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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { OrgMembership } from "@/types/instance";

const ORG_ROLES = ["member", "admin", "owner"] as const;

export function OrgMembershipRow({
	userId,
	org,
	onChange,
}: {
	userId: string;
	org: OrgMembership;
	onChange: () => void;
}) {
	const [removeOpen, setRemoveOpen] = useState(false);
	const changeRole = useAction(
		(role: string) =>
			apiFetch(`/instance/users/${userId}/organizations/${org.id}/role`, {
				method: "PUT",
				body: JSON.stringify({ role }),
			}),
		{ success: "Role updated", error: "Could not change role" },
	);

	const remove = useAction(
		() =>
			apiFetch(`/instance/users/${userId}/organizations/${org.id}`, {
				method: "DELETE",
			}),
		{ success: `Removed from ${org.name}`, error: "Could not remove from organization" },
	);

	async function handleRemove() {
		await remove
			.trigger()
			.then(() => {
				setRemoveOpen(false);
				onChange();
			})
			.catch(() => {});
	}

	return (
		<TableRow>
			<TableCell>{org.name}</TableCell>
			<TableCell>
				<Select
					value={org.role}
					onValueChange={(role) =>
						changeRole
							.trigger(role as string)
							.then(onChange)
							.catch(() => {})
					}
					disabled={changeRole.isLoading}
				>
					<SelectTrigger size="sm">
						<SelectValue items={ORG_ROLES.map((role) => ({ value: role, label: role }))} />
					</SelectTrigger>
					<SelectContent>
						{ORG_ROLES.map((role) => (
							<SelectItem key={role} value={role}>
								{role}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="text-right">
				<AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
					<AlertDialogTrigger
						render={
							<Button variant="secondary" size="sm">
								Remove
							</Button>
						}
					/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remove from "{org.name}"?</AlertDialogTitle>
							<AlertDialogDescription>
								This user will lose access to every project in this organization. This can't be
								undone from here — they'd need to be re-invited.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction disabled={remove.isLoading} onClick={handleRemove}>
								Remove
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</TableCell>
		</TableRow>
	);
}

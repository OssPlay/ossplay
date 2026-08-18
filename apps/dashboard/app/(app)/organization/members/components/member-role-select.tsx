"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import type { OrgMember } from "@/types/instance";
import { ROLE_LABELS, ROLES } from "./roles";

export function MemberRoleSelect({
	orgId,
	member,
	onChanged,
}: {
	orgId: string;
	member: OrgMember;
	onChanged: () => void;
}) {
	const changeRole = useAction(
		(role: (typeof ROLES)[number]) =>
			apiFetch(`/organizations/${orgId}/members/${member.userId}`, {
				method: "PUT",
				body: JSON.stringify({ role }),
			}),
		{ error: "Could not update member" },
	);

	async function handleRoleChange(value: string | null) {
		if (!value || value === member.role) return;
		await changeRole
			.trigger(value as (typeof ROLES)[number])
			.then(onChanged)
			.catch(() => {});
	}

	return (
		<Select value={member.role} onValueChange={handleRoleChange} disabled={changeRole.isLoading}>
			<SelectTrigger size="sm" className="w-fit">
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
	);
}

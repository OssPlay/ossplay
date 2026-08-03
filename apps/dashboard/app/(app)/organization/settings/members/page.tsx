"use client";

import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { useCurrentOrgId } from "@/lib/current-org";

type Member = {
	userId: string;
	name: string;
	email: string;
	role: string;
	lastSignInAt: string | null;
};
type Invitation = {
	id: string;
	email: string;
	role: string;
	status: string;
	isExpired: boolean;
	createdAt: string;
};

const ROLES = ["member", "admin", "owner"] as const;

export default function MembersPage() {
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));

	const { data: membersData, mutate: mutateMembers } = useSWR<{ members: Member[] }>(
		orgId ? `/organizations/${orgId}/members` : null,
	);
	const { data: invitationsData, mutate: mutateInvitations } = useSWR<{
		invitations: Invitation[];
	}>(orgId ? `/organizations/${orgId}/invitations` : null);

	if (!orgId) return null;

	const canManageMembers = Boolean(invitationsData);

	function refresh() {
		mutateMembers();
		mutateInvitations();
	}

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Last sign-in</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(membersData?.members ?? []).map((member) => (
								<TableRow key={member.userId}>
									<TableCell>{member.name}</TableCell>
									<TableCell>{member.email}</TableCell>
									<TableCell>
										<Badge variant="secondary">{member.role}</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{member.lastSignInAt ? new Date(member.lastSignInAt).toLocaleString() : "Never"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{canManageMembers && (
				<>
					<InviteCard orgId={orgId} onInvited={refresh} />
					<InvitationsCard invitations={invitationsData?.invitations ?? []} onChange={refresh} />
				</>
			)}
		</div>
	);
}

function InviteCard({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("member");
	const [warning, setWarning] = useState<string | null>(null);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string }>(`/organizations/${orgId}/invitations`, {
				method: "POST",
				body: JSON.stringify({ email, role }),
			}),
		{ error: "Could not send invitation" },
	);

	async function handleSubmit() {
		setWarning(null);
		await invite
			.trigger()
			.then((res) => {
				if (res.warning) setWarning(res.warning);
				setEmail("");
				onInvited();
			})
			.catch(() => {});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Invite a member</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
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
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inviteRole">Role</Label>
						<select
							id="inviteRole"
							value={role}
							onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
							disabled={invite.isLoading}
							className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
						>
							{ROLES.map((r) => (
								<option key={r} value={r}>
									{r}
								</option>
							))}
						</select>
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
					<p className="text-sm text-muted-foreground">{warning} — share the link manually.</p>
				)}
			</CardContent>
		</Card>
	);
}

function InvitationsCard({
	invitations,
	onChange,
}: {
	invitations: Invitation[];
	onChange: () => void;
}) {
	const pending = invitations.filter((i) => i.status === "pending");
	if (pending.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Pending invitations</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{pending.map((invitation) => (
							<InvitationRowItem key={invitation.id} invitation={invitation} onRevoked={onChange} />
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function InvitationRowItem({
	invitation,
	onRevoked,
}: {
	invitation: Invitation;
	onRevoked: () => void;
}) {
	const revoke = useAction(
		() => apiFetch(`/invitations/${invitation.id}/revoke`, { method: "POST" }),
		{ error: "Could not revoke invitation" },
	);

	async function handleRevoke() {
		await revoke
			.trigger()
			.then(onRevoked)
			.catch(() => {});
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
				<LoadingButton variant="ghost" size="sm" loading={revoke.isLoading} onClick={handleRevoke}>
					Revoke
				</LoadingButton>
			</TableCell>
		</TableRow>
	);
}

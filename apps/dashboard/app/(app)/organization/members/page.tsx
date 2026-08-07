"use client";

import { ClockIcon, MailPlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
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
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
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
	const { organizations, user } = useAuth();
	// allowAny: root managing an org it isn't a member of (navigated here
	// from instance/organizations/[id]) — see current-org.ts's comment.
	const orgId = useCurrentOrgId(
		organizations.map((o) => o.id),
		{ allowAny: user.instanceRole === "root" },
	);
	const hasMembership = organizations.some((o) => o.id === orgId);

	// Only meaningful for root browsing an org outside its own membership
	// (see current-org.ts's `allowAny`) — GET /:orgId/members and
	// .../invitations don't 404 for a nonexistent org (root's org-membership
	// bypass means they resolve fine, just against an empty result set), so
	// without this dedicated existence check a stale sessionStorage org id
	// (e.g. one deleted since it was last visited) would render every list
	// on this page as silently empty instead of surfacing that the org
	// doesn't actually exist anymore.
	const { error: orgError, isLoading: orgLoading } = useSWR<{ organization: { id: string } }>(
		!hasMembership && orgId ? `/organizations/${orgId}` : null,
	);

	const {
		data: membersData,
		isLoading: membersLoading,
		mutate: mutateMembers,
	} = useSWR<{ members: Member[] }>(orgId ? `/organizations/${orgId}/members` : null);
	const { data: invitationsData, mutate: mutateInvitations } = useSWR<{
		invitations: Invitation[];
	}>(orgId ? `/organizations/${orgId}/invitations` : null);

	if (!orgId) return null;

	if (!hasMembership && orgError instanceof ApiError && orgError.status === 404) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	// GET /:orgId/invitations is org:manage_members-gated (owner/admin) —
	// this response resolving at all is what tells a plain member they can't
	// invite or manage pending invitations, no separate permission check
	// needed client-side.
	const canManageMembers = Boolean(invitationsData);
	const pending = (invitationsData?.invitations ?? []).filter((i) => i.status === "pending");

	function refresh() {
		mutateMembers();
		mutateInvitations();
	}

	return (
		<ApiLoader isLoading={membersLoading || orgLoading}>
			<Container
				header={{
					icon: UsersIcon,
					title: "Members",
					description: "Everyone with access to this organization.",
				}}
				size="sm"
			>
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
			</Container>

			{canManageMembers && (
				<>
					<Container
						header={{
							icon: MailPlusIcon,
							title: "Invite a member",
							description: "Send an email invitation to join this organization.",
						}}
						size="sm"
					>
						<InviteForm orgId={orgId} onInvited={refresh} />
					</Container>

					{pending.length > 0 && (
						<Container
							header={{
								icon: ClockIcon,
								title: "Pending invitations",
								description: "Invitations that haven't been accepted yet.",
							}}
							size="sm"
						>
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
										<InvitationRowItem
											key={invitation.id}
											invitation={invitation}
											onRevoked={refresh}
										/>
									))}
								</TableBody>
							</Table>
						</Container>
					)}
				</>
			)}
		</ApiLoader>
	);
}

function InviteForm({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("member");
	const [warning, setWarning] = useState<string | null>(null);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string }>(`/organizations/${orgId}/invitations`, {
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
		await invite
			.trigger()
			.then((res) => {
				setWarning(res.warning ?? null);
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
		</div>
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

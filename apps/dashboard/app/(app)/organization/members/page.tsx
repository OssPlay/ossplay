"use client";

import { ClockIcon, MailPlusIcon, UsersIcon } from "lucide-react";
import useSWR from "swr";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { useOrgSectionId } from "@/lib/current-org";
import type { OrgInvitation, OrgMember } from "@/types/instance";
import { InvitationRowItem } from "./components/invitation-row-item";
import { InviteForm } from "./components/invite-form";
import { MemberRemoveAction } from "./components/member-remove-action";
import { MemberRoleSelect } from "./components/member-role-select";

export default function MembersPage() {
	const { user, organizations, instance } = useAuth();
	const orgId = useOrgSectionId();
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
	} = useSWR<{ members: OrgMember[] }>(orgId ? `/organizations/${orgId}/members` : null);
	const { data: invitationsData, mutate: mutateInvitations } = useSWR<{
		invitations: OrgInvitation[];
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
			{canManageMembers && (
				<>
					<Container
						header={{
							icon: MailPlusIcon,
							title: "Invite a member",
							description: "Send an email invitation to join this organization.",
						}}
						size="lg"
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
							size="lg"
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
			<Container
				header={{
					icon: UsersIcon,
					title: "Members",
					description: "Everyone with access to this organization.",
					learnMore: instance?.docsUrl ? { href: `${instance.docsUrl}/guides/members` } : undefined,
				}}
				size="lg"
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Last sign-in</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{(membersData?.members ?? []).map((member) => (
							<TableRow key={member.userId}>
								<TableCell>{member.name}</TableCell>
								<TableCell>{member.email}</TableCell>
								<TableCell>
									{canManageMembers ? (
										<MemberRoleSelect orgId={orgId} member={member} onChanged={refresh} />
									) : (
										<Badge variant="secondary" className="capitalize">
											{member.role}
										</Badge>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{member.lastSignInAt ? new Date(member.lastSignInAt).toLocaleString() : "Never"}
								</TableCell>
								<TableCell className="text-right">
									{(canManageMembers || member.userId === user.id) && (
										<MemberRemoveAction
											orgId={orgId}
											member={member}
											isSelf={member.userId === user.id}
											onChanged={refresh}
										/>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Container>
		</ApiLoader>
	);
}

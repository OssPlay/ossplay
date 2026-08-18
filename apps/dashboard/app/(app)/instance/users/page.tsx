"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ClockIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { useInstanceRoleGate } from "@/hooks/use-instance-role-gate";
import { useServerTable } from "@/hooks/use-server-table";
import { apiFetch } from "@/lib/api";
import type { InstanceInvitation, InstanceUser } from "@/types/instance";
import { InstanceInvitationRow } from "./components/instance-invitation-row";
import { InviteUserDialog } from "./components/invite-user-dialog";

interface UsersResponse {
	users: InstanceUser[];
	total: number;
	page: number;
	pageSize: number;
}

// Root-only: manage identity/security for every account on this instance —
// force-reset a password or 2FA, block/delete, edit org roles. Distinct
// from (and more powerful than) anything an org-level Members page does —
// see ARCHITECTURE.md's Authorization Model section.
export default function InstanceUsersPage() {
	const { instance } = useAuth();
	const table = useServerTable<UsersResponse, InstanceUser>({
		endpoint: "/instance/users",
		items: (response) => response.users,
		pageSize: 10,
	});
	const { data: invitationsData, mutate: mutateInvitations } = useSWR<{
		invitations: InstanceInvitation[];
	}>("/instance/users/invitations");
	const pending = (invitationsData?.invitations ?? []).filter((i) => i.status === "pending");
	const [inviteOpen, setInviteOpen] = useState(false);
	const forbidden = useInstanceRoleGate(table.error);

	// Reuses the same per-user PUT endpoint the detail page's SecurityActions
	// calls — no bulk endpoint exists (or is needed) for this.
	const bulkUpdateBlock = useAction(
		(ids: string[], action: "block" | "unblock") =>
			Promise.all(ids.map((id) => apiFetch(`/instance/users/${id}/${action}`, { method: "PUT" }))),
		{ error: "Could not update the selected users" },
	);

	if (forbidden) {
		return <InstanceForbidden />;
	}

	const columns: DataTableColumn<InstanceUser>[] = [
		{
			key: "name",
			title: "Name",
			cell: (row) => (
				<span>
					{row.name}
					{row.instanceRole && (
						<Badge variant="default" className="ml-2">
							{row.instanceRole === "root" ? "root" : "org creator"}
						</Badge>
					)}
				</span>
			),
		},
		{ key: "email", title: "Email" },
		{
			key: "totpEnabled",
			title: "2FA / Passkeys",
			className: "text-muted-foreground",
			cell: (row) =>
				`${row.totpEnabled ? "2FA" : "No 2FA"} · ${row.passkeyCount} passkey${
					row.passkeyCount === 1 ? "" : "s"
				}`,
		},
		{
			key: "disabledAt",
			title: "Status",
			cell: (row) =>
				row.disabledAt ? (
					<Badge variant="destructive">Blocked</Badge>
				) : (
					<Badge variant="success">Active</Badge>
				),
		},
		{
			key: "lastSignInAt",
			title: "Last sign-in",
			className: "text-muted-foreground",
			formatter: "datetime",
		},
	];

	async function handleBulk(ids: InstanceUser[], action: "block" | "unblock") {
		await bulkUpdateBlock
			.trigger(
				ids.map((u) => u.id),
				action,
			)
			.then(() => {
				toast.success(action === "block" ? "Selected users blocked" : "Selected users unblocked");
				table.mutate();
			})
			.catch(() => {});
	}

	return (
		<>
			<Container
				header={{
					icon: UsersIcon,
					title: "Users",
					description: "Every account on this instance.",
					action: {
						icon: UserPlusIcon,
						title: "Add user",
						onClick: () => setInviteOpen(true),
					},
					learnMore: instance?.docsUrl
						? { href: `${instance.docsUrl}/guides/instance-users` }
						: undefined,
				}}
				size="lg"
			>
				<DataTable
					table={table}
					rowId={(row) => row.id}
					columns={columns}
					searchPlaceholder="Search name or email…"
					emptyTitle="No users yet"
					bulkActions={[
						{
							label: "Block selected",
							onClick: (selected) => handleBulk(selected, "block"),
							confirm: {
								title: "Block selected users?",
								description: "They won't be able to sign in until unblocked.",
							},
						},
						{
							label: "Unblock selected",
							onClick: (selected) => handleBulk(selected, "unblock"),
							confirm: {
								title: "Unblock selected users?",
								description: "They'll be able to sign in again.",
							},
						},
					]}
					rowActions={(row) => (
						<Link
							href={`/instance/users/${row.id}`}
							className={buttonVariants({ variant: "secondary", size: "sm" })}
						>
							Manage
						</Link>
					)}
				/>

				<InviteUserDialog
					open={inviteOpen}
					onOpenChange={setInviteOpen}
					onInvited={() => {
						table.mutate();
						mutateInvitations();
					}}
				/>
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
								<InstanceInvitationRow
									key={invitation.id}
									invitation={invitation}
									onRevoked={() => mutateInvitations()}
								/>
							))}
						</TableBody>
					</Table>
				</Container>
			)}
		</>
	);
}

"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ClockIcon, CopyIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { CopyableLink } from "@/components/copyable-link";
import { FormError } from "@/components/form-error";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import Container from "@/components/ui/container";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";

interface InstanceUser {
	id: string;
	email: string;
	name: string;
	instanceRole: string | null;
	totpEnabled: boolean;
	disabledAt: string | null;
	passkeyCount: number;
	createdAt: string;
	lastSignInAt: string | null;
}

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
	const forbidden = table.error instanceof ApiError && table.error.status === 403;

	// Reuses the same per-user PUT endpoint the detail page's SecurityActions
	// calls — no bulk endpoint exists (or is needed) for this.
	const bulkUpdateBlock = useAction(
		(ids: string[], action: "block" | "unblock") =>
			Promise.all(ids.map((id) => apiFetch(`/instance/users/${id}/${action}`, { method: "PUT" }))),
		{ error: "Could not update the selected users" },
	);

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
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
						},
						{
							label: "Unblock selected",
							onClick: (selected) => handleBulk(selected, "unblock"),
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

interface InstanceInvitation {
	id: string;
	email: string;
	instanceRole: "root" | "org_creator" | null;
	status: string;
	isExpired: boolean;
	createdAt: string;
	inviteUrl: string;
}

function InstanceInvitationRow({
	invitation,
	onRevoked,
}: {
	invitation: InstanceInvitation;
	onRevoked: () => void;
}) {
	const revoke = useAction(
		() => apiFetch(`/instance/users/invitations/${invitation.id}/revoke`, { method: "POST" }),
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
				<Badge variant="secondary">{INVITE_ROLE_LABELS[invitation.instanceRole ?? "none"]}</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{invitation.isExpired ? "Expired" : "Pending"}
			</TableCell>
			<TableCell className="text-right">
				<Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Copy invite link">
					<CopyIcon className="size-3.5" />
				</Button>
				<LoadingButton variant="ghost" size="sm" loading={revoke.isLoading} onClick={handleRevoke}>
					Revoke
				</LoadingButton>
			</TableCell>
		</TableRow>
	);
}

const INVITE_ROLE_LABELS: Record<"none" | "org_creator" | "root", string> = {
	none: "No instance role",
	org_creator: "Organization creator — can create organizations",
	root: "Instance administrator (root) — full access",
};

// Org-less: this only provisions a bare account (optionally with an
// instance role) — getting the new user into an org afterward is a separate
// step via that org's own Members page. See instance-users.ts's POST /invite.
function InviteUserDialog({
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

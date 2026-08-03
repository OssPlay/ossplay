"use client";

import { UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
					{row.instanceRole === "root" && (
						<Badge variant="secondary" className="ml-2">
							root
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
				`${row.totpEnabled ? "2FA" : "No 2FA"} · ${row.passkeyCount} passkey${row.passkeyCount === 1 ? "" : "s"}`,
		},
		{
			key: "disabledAt",
			title: "Status",
			cell: (row) =>
				row.disabledAt ? (
					<Badge variant="destructive">Blocked</Badge>
				) : (
					<Badge variant="secondary">Active</Badge>
				),
		},
		{
			key: "lastSignInAt",
			title: "Last sign-in",
			className: "text-muted-foreground",
			cell: (row) => (row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleString() : "Never"),
		},
	];

	async function handleBulk(ids: InstanceUser[], action: "block" | "unblock") {
		await bulkUpdateBlock
			.trigger(
				ids.map((u) => u.id),
				action,
			)
			.then(() => table.mutate())
			.catch(() => {});
	}

	return (
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
				onInvited={() => table.mutate()}
			/>
		</Container>
	);
}

const ROLES = ["member", "admin", "owner"] as const;

function InviteUserDialog({
	open,
	onOpenChange,
	onInvited,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvited: () => void;
}) {
	const { data: statusData } = useSWR<{ smtpConfigured: boolean }>("/setup/status");
	const { data: orgsData } = useSWR<{ organizations: Array<{ id: string; name: string }> }>(
		open ? "/organizations" : null,
	);
	const smtpConfigured = statusData?.smtpConfigured ?? false;
	const organizations = orgsData?.organizations ?? [];

	const [email, setEmail] = useState("");
	const [orgId, setOrgId] = useState("");
	const [role, setRole] = useState<(typeof ROLES)[number]>("member");
	const [warning, setWarning] = useState<string | null>(null);

	// The org list fetch (above) only starts once the dialog opens, so it's
	// never ready by the time handleOpenChange's own reset runs — this picks
	// a default the moment it actually arrives instead, without clobbering a
	// selection the user already made.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `orgId` — reacting to it here would fight the user's own selection.
	useEffect(() => {
		if (!orgId && organizations.length > 0) setOrgId(organizations[0]?.id ?? "");
	}, [organizations]);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string }>(`/organizations/${orgId}/invitations`, {
				method: "POST",
				body: JSON.stringify({ email, role }),
			}),
		{ error: "Could not send invitation", success: "Invitation sent" },
	);

	function handleOpenChange(next: boolean) {
		if (next) {
			setEmail("");
			setOrgId(organizations[0]?.id ?? "");
			setRole("member");
			setWarning(null);
			invite.reset();
		}
		onOpenChange(next);
	}

	async function handleSubmit() {
		setWarning(null);
		await invite
			.trigger()
			.then((res) => {
				if (res.warning) {
					setWarning(res.warning);
					return;
				}
				onOpenChange(false);
				onInvited();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add user</DialogTitle>
				</DialogHeader>
				{!smtpConfigured ? (
					<p className="text-sm text-muted-foreground">
						Configure a default SMTP config first — inviting a user requires sending them an email
						with their invite link. See{" "}
						<Link href="/instance/smtp" className="underline underline-offset-2">
							Email &amp; SMTP
						</Link>
						.
					</p>
				) : organizations.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Create an organization first — a new user needs one to be invited into.
					</p>
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
						<div className="flex flex-col gap-1.5 w-full">
							<Label htmlFor="inviteUserOrg">Organization</Label>
							<Select
								value={orgId}
								onValueChange={(value) => setOrgId(value ?? "")}
								disabled={invite.isLoading}
							>
								<SelectTrigger id="inviteUserOrg" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{organizations.map((org) => (
										<SelectItem key={org.id} value={org.id}>
											{org.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5 w-full">
							<Label htmlFor="inviteUserRole">Role</Label>
							<Select
								value={role}
								onValueChange={(value) => setRole((value as (typeof ROLES)[number]) ?? "member")}
								disabled={invite.isLoading}
							>
								<SelectTrigger id="inviteUserRole" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ROLES.map((r) => (
										<SelectItem key={r} value={r}>
											{r}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<FormError
							message={
								invite.error ? errorMessage(invite.error, "Could not send invitation") : null
							}
						/>
						{warning && <p className="text-sm text-muted-foreground">{warning}</p>}
					</div>
				)}
				<DialogFooter>
					{smtpConfigured && organizations.length > 0 && (
						<InviteSubmitButton
							loading={invite.isLoading}
							disabled={!email || !orgId}
							onClick={handleSubmit}
						/>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function InviteSubmitButton({
	loading,
	disabled,
	onClick,
}: {
	loading: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-block">
						<LoadingButton loading={loading} disabled={disabled} onClick={onClick}>
							Send invite
						</LoadingButton>
					</span>
				}
			/>
			<TooltipContent>Sends an email invite with a link to join the organization.</TooltipContent>
		</Tooltip>
	);
}

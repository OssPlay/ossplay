"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import {
	DataTable,
	type DataTableColumn,
} from "@/components/layout/data-table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAction } from "@/hooks/use-action";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { CheckIcon, CopyIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

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
	const forbidden = table.error instanceof ApiError &&
		table.error.status === 403;

	// Reuses the same per-user PUT endpoint the detail page's SecurityActions
	// calls — no bulk endpoint exists (or is needed) for this.
	const bulkUpdateBlock = useAction(
		(ids: string[], action: "block" | "unblock") =>
			Promise.all(
				ids.map((id) =>
					apiFetch(`/instance/users/${id}/${action}`, { method: "PUT" })
				),
			),
		{ error: "Could not update the selected users" },
	);

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">
				Only the instance root can view this page.
			</p>
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
				`${row.totpEnabled ? "2FA" : "No 2FA"} · ${row.passkeyCount} passkey${
					row.passkeyCount === 1 ? "" : "s"
				}`,
		},
		{
			key: "disabledAt",
			title: "Status",
			cell: (row) =>
				row.disabledAt
					? <Badge variant="destructive">Blocked</Badge>
					: <Badge variant="secondary">Active</Badge>,
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

// Org-less: this only provisions a bare account (optionally with root
// access) — getting the new user into an org afterward is a separate step
// via that org's own Members page. See instance-users.ts's POST /invite.
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
	const [grantRoot, setGrantRoot] = useState(false);
	const [result, setResult] = useState<
		{ warning?: string; inviteUrl?: string } | null
	>(null);

	const invite = useAction(
		() =>
			apiFetch<{ warning?: string; inviteUrl?: string }>(
				"/instance/users/invite",
				{
					method: "POST",
					body: JSON.stringify({ email, grantRoot }),
				},
			),
		{ error: "Could not create invitation" },
	);

	function handleOpenChange(next: boolean) {
		if (next) {
			setEmail("");
			setGrantRoot(false);
			setResult(null);
			invite.reset();
		}
		onOpenChange(next);
	}

	async function handleSubmit() {
		await invite
			.trigger()
			.then((res) => {
				if (res.warning) {
					// Email couldn't go out — keep the dialog open with the link so
					// root can copy and share it manually instead of losing it.
					setResult(res);
					return;
				}
				toast.success("Invitation sent");
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
				{result
					? (
						<div className="flex flex-col gap-3">
							<p className="text-sm text-muted-foreground">{result.warning}</p>
							{result.inviteUrl && <CopyableLink url={result.inviteUrl} />}
						</div>
					)
					: (
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
							<div className="flex items-center gap-2">
								<Checkbox
									id="inviteUserGrantRoot"
									checked={grantRoot}
									onCheckedChange={setGrantRoot}
									disabled={invite.isLoading}
								/>
								<Label htmlFor="inviteUserGrantRoot" className="font-normal">
									Grant instance administrator (root) access
								</Label>
							</div>
							<FormError
								message={invite.error
									? errorMessage(invite.error, "Could not create invitation")
									: null}
							/>
						</div>
					)}
				<DialogFooter>
					{result
						? (
							<Button type="button" onClick={() => handleOpenChange(false)}>
								Done
							</Button>
						)
						: (
							<LoadingButton
								loading={invite.isLoading}
								disabled={!email}
								onClick={handleSubmit}
							>
								Send invite
							</LoadingButton>
						)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CopyableLink({ url }: { url: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
			<span className="flex-1 truncate font-mono text-xs">{url}</span>
			<Button
				type="button"
				variant="secondary"
				size="icon-sm"
				onClick={handleCopy}
			>
				{copied
					? <CheckIcon className="size-3.5" />
					: <CopyIcon className="size-3.5" />}
			</Button>
		</div>
	);
}

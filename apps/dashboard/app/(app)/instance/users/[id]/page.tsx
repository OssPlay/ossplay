"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ArrowLeftIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { FormError } from "@/components/form-error";
import { Section } from "@/components/layout/section";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Container from "@/components/ui/container";
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
import { ApiError, apiFetch, errorMessage } from "@/lib/api";

type UserDetail = {
	id: string;
	email: string;
	name: string;
	instanceRole: string | null;
	totpEnabled: boolean;
	disabledAt: string | null;
	passkeyCount: number;
	createdAt: string;
	lastSignInAt: string | null;
};
type OrgMembership = { id: string; name: string; role: string };
type UserDetailResponse = { user: UserDetail; organizations: OrgMembership[] };

const ORG_ROLES = ["member", "admin", "owner"] as const;

export default function InstanceUserDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const { data, error, mutate } = useSWR<UserDetailResponse>(`/instance/users/${params.id}`);

	const forbidden = error instanceof ApiError && error.status === 403;
	const notFound = error instanceof ApiError && error.status === 404;

	if (forbidden) {
		return (
			<p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
		);
	}
	if (notFound) {
		return <p className="text-sm text-muted-foreground">User not found.</p>;
	}
	if (!data) return null;

	const { user, organizations } = data;

	return (
		<Section
			breadcrumb={[
				{
					title: `${user.name} (${user.email})`,
					href: `/instance/users/${user.id}`,
				},
			]}
		>
			<Container
				header={{
					icon: UserIcon,
					title: user.name,
					description: user.email,
				}}
			>
				<div className="flex flex-col gap-6">
					<Link
						href="/instance/users"
						className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
					>
						<ArrowLeftIcon className="size-4" /> Back to Users
					</Link>

					<div className="flex flex-wrap items-center gap-2">
						{user.instanceRole === "root" && <Badge variant="secondary">root</Badge>}
						{user.disabledAt ? (
							<Badge variant="destructive">Blocked</Badge>
						) : (
							<Badge variant="secondary">Active</Badge>
						)}
						<span className="text-sm text-muted-foreground">
							{user.totpEnabled ? "2FA enabled" : "No 2FA"} · {user.passkeyCount} passkey
							{user.passkeyCount === 1 ? "" : "s"}
						</span>
						<span className="text-sm text-muted-foreground">
							Last sign-in:{" "}
							{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}
						</span>
					</div>

					<SecurityActions user={user} onChange={() => mutate()} />
					<OrganizationsCard
						userId={user.id}
						organizations={organizations}
						onChange={() => mutate()}
					/>
					<DangerZone user={user} onDeleted={() => router.replace("/instance/users")} />
				</div>
			</Container>
		</Section>
	);
}

function SecurityActions({ user, onChange }: { user: UserDetail; onChange: () => void }) {
	const [reset2faOpen, setReset2faOpen] = useState(false);
	const resetPassword = useAction(
		() =>
			apiFetch<{ temporaryPassword: string }>(`/instance/users/${user.id}/password`, {
				method: "PUT",
				body: JSON.stringify({ generateTemporary: true }),
			}),
		{ error: "Could not reset password" },
	);

	const reset2fa = useAction(
		() => apiFetch(`/instance/users/${user.id}/reset-2fa`, { method: "POST" }),
		{ error: "Could not reset 2FA" },
	);

	const toggleBlock = useAction(
		() =>
			apiFetch(`/instance/users/${user.id}/${user.disabledAt ? "unblock" : "block"}`, {
				method: "PUT",
			}),
		{
			error: user.disabledAt ? "Could not unblock user" : "Could not block user",
		},
	);

	async function handleReset2fa() {
		await reset2fa
			.trigger()
			.then(() => {
				setReset2faOpen(false);
				onChange();
			})
			.catch(() => {});
	}

	async function handleToggleBlock() {
		await toggleBlock
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Security</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{resetPassword.data ? (
					<p className="text-sm">
						Temporary password (copy now, it won&apos;t be shown again):{" "}
						<span className="font-mono">{resetPassword.data.temporaryPassword}</span>
					</p>
				) : (
					<div className="flex flex-wrap gap-2">
						<LoadingButton
							variant="secondary"
							size="sm"
							loading={resetPassword.isLoading}
							onClick={() => resetPassword.trigger()}
						>
							Reset password
						</LoadingButton>

						{user.totpEnabled || user.passkeyCount > 0 ? (
							<AlertDialog open={reset2faOpen} onOpenChange={setReset2faOpen}>
								<AlertDialogTrigger
									render={
										<Button variant="secondary" size="sm">
											Reset 2FA &amp; passkeys
										</Button>
									}
								/>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Reset 2FA &amp; passkeys?</AlertDialogTitle>
										<AlertDialogDescription>
											{user.name} will lose their authenticator and every registered passkey, and
											will need to set 2FA up again. This can't be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction disabled={reset2fa.isLoading} onClick={handleReset2fa}>
											Reset 2FA &amp; passkeys
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						) : null}

						<LoadingButton
							variant="secondary"
							size="sm"
							loading={toggleBlock.isLoading}
							onClick={handleToggleBlock}
						>
							{user.disabledAt ? "Unblock user" : "Block user"}
						</LoadingButton>
					</div>
				)}
				<FormError
					message={
						resetPassword.error
							? errorMessage(resetPassword.error, "Could not reset password")
							: reset2fa.error
								? errorMessage(reset2fa.error, "Could not reset 2FA")
								: toggleBlock.error
									? errorMessage(toggleBlock.error, "Could not update block status")
									: null
					}
				/>
			</CardContent>
		</Card>
	);
}

function OrganizationsCard({
	userId,
	organizations,
	onChange,
}: {
	userId: string;
	organizations: OrgMembership[];
	onChange: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Organizations</CardTitle>
			</CardHeader>
			<CardContent>
				{organizations.length === 0 ? (
					<p className="text-sm text-muted-foreground">Not a member of any organization.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Organization</TableHead>
								<TableHead>Role</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{organizations.map((org) => (
								<OrgMembershipRow key={org.id} userId={userId} org={org} onChange={onChange} />
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

function OrgMembershipRow({
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
		{ error: "Could not change role" },
	);

	const remove = useAction(
		() =>
			apiFetch(`/instance/users/${userId}/organizations/${org.id}`, {
				method: "DELETE",
			}),
		{ error: "Could not remove from organization" },
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

function DangerZone({ user, onDeleted }: { user: UserDetail; onDeleted: () => void }) {
	const [open, setOpen] = useState(false);
	const deleteUser = useAction(() => apiFetch(`/instance/users/${user.id}`, { method: "DELETE" }), {
		error: "Could not delete user",
	});

	async function handleDelete() {
		await deleteUser
			.trigger()
			.then(() => {
				setOpen(false);
				onDeleted();
			})
			.catch(() => {});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Delete user</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<FormError
					message={
						deleteUser.error ? errorMessage(deleteUser.error, "Could not delete user") : null
					}
				/>
				<AlertDialog open={open} onOpenChange={setOpen}>
					<AlertDialogTrigger
						render={
							<Button variant="secondary" className="w-fit">
								Delete user
							</Button>
						}
					/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
							<AlertDialogDescription>
								This permanently deletes the account and removes it from every organization. This
								can't be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction disabled={deleteUser.isLoading} onClick={handleDelete}>
								Delete user
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}

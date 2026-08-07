"use client";

import { Building2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
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
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useCurrentOrgId } from "@/lib/current-org";

// Either a real membership row (from /auth/me, has `role`/`projects`) or, for
// root managing an org it doesn't belong to (navigated to from
// instance/organizations/[id] — see current-org.ts's `allowAny`), a
// synthesized stand-in built from GET /organizations/:orgId. Root always
// passes org:manage_settings/org:delete server-side regardless of
// membership (see permissions.ts), so `role: "owner"` here just drives the
// same UI a real owner would see — it's not asserting a membership that
// doesn't exist.
type OrgLike = { id: string; name: string; role: string; projectCount: number | null };

export default function OrganizationGeneralPage() {
	const router = useRouter();
	const { organizations, isLoading, mutate, user } = useAuth();
	const orgId = useCurrentOrgId(
		organizations.map((o) => o.id),
		{ allowAny: user.instanceRole === "root" },
	);
	const membershipOrg = organizations.find((o) => o.id === orgId);

	const {
		data: fetchedOrg,
		error: fetchedOrgError,
		isLoading: fetchedOrgLoading,
	} = useSWR<{
		organization: { id: string; name: string };
	}>(!membershipOrg && orgId ? `/organizations/${orgId}` : null);

	// Only reachable for root browsing an org outside its own membership (see
	// current-org.ts's `allowAny`) — surfaces a stale sessionStorage org id
	// (e.g. one deleted since it was last visited) as a clear message
	// instead of this page silently rendering nothing.
	if (!membershipOrg && fetchedOrgError instanceof ApiError && fetchedOrgError.status === 404) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	const org: OrgLike | undefined = membershipOrg
		? {
				id: membershipOrg.id,
				name: membershipOrg.name,
				role: membershipOrg.role,
				projectCount: membershipOrg.projects.length,
			}
		: fetchedOrg
			? {
					id: fetchedOrg.organization.id,
					name: fetchedOrg.organization.name,
					role: "owner",
					projectCount: null,
				}
			: undefined;

	return (
		<ApiLoader isLoading={isLoading || fetchedOrgLoading}>
			{org && (
				<>
					<Container
						header={{
							icon: Building2Icon,
							title: "Organization",
							description: "This organization's name and your role within it.",
						}}
						size="sm"
					>
						<OrganizationName org={org} onSaved={() => mutate()} />
					</Container>

					{(org.role === "owner" || user.instanceRole === "root") && (
						<Container
							header={{
								icon: TriangleAlertIcon,
								title: "Delete organization",
								description: "Permanently remove this organization and everything in it.",
							}}
							size="sm"
						>
							<DeleteOrganization
								org={org}
								onDeleted={() => {
									mutate();
									// Root managing an org via instance/organizations has
									// somewhere to go back to (the org list) — everyone else
									// (a genuine owner leaving their own org) lands on "/",
									// which already knows how to show the right zero-org state.
									router.replace(user.instanceRole === "root" ? "/instance/organizations" : "/");
								}}
							/>
						</Container>
					)}
				</>
			)}
		</ApiLoader>
	);
}

function OrganizationName({ org, onSaved }: { org: OrgLike; onSaved: () => void }) {
	const [name, setName] = useState(org.name);
	// Reseed only when the active org itself changes (not on every
	// background /auth/me revalidation) — otherwise a revalidation mid-edit
	// would stomp on what the user is currently typing.
	const seededOrgId = useRef(org.id);
	useEffect(() => {
		if (seededOrgId.current !== org.id) {
			setName(org.name);
			seededOrgId.current = org.id;
		}
	}, [org.id, org.name]);

	// org:manage_settings is owner-only — see permissions.ts. No client-side
	// permission engine exists in this app; every check like this is a direct
	// role comparison. Root always resolves as "owner" here (see OrgLike's
	// comment), so this stays a plain role check.
	const canManage = org.role === "owner";

	const save = useAction(
		() =>
			apiFetch<{ organization: { name: string } }>(`/organizations/${org.id}`, {
				method: "PUT",
				body: JSON.stringify({ name }),
			}),
		{
			success: (res) => `Organization renamed to "${res.organization.name}"`,
			error: (err) => `${err}`,
		},
	);

	async function handleSave() {
		await save
			.trigger()
			.then(onSaved)
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			<FormField
				id="orgName"
				label="Organization name"
				value={name}
				onChange={setName}
				autoComplete="off"
				disabled={!canManage || save.isLoading}
				helpText={canManage ? undefined : "Only the organization owner can rename it."}
			/>
			<FormError
				message={save.error ? errorMessage(save.error, "Could not rename organization") : null}
			/>
			{canManage && (
				<LoadingButton
					type="button"
					loading={save.isLoading}
					onClick={handleSave}
					disabled={!name.trim() || name === org.name}
					className="w-fit"
				>
					Save changes
				</LoadingButton>
			)}
			<p className="text-xs text-muted-foreground">
				Your role: <span className="capitalize">{org.role}</span>
			</p>
		</div>
	);
}

function DeleteOrganization({ org, onDeleted }: { org: OrgLike; onDeleted: () => void }) {
	const [open, setOpen] = useState(false);
	const remove = useAction(() => apiFetch(`/organizations/${org.id}`, { method: "DELETE" }), {
		success: `"${org.name}" deleted`,
		error: "Could not delete organization",
	});

	async function handleDelete() {
		await remove
			.trigger()
			.then(() => {
				setOpen(false);
				onDeleted();
			})
			.catch(() => {});
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				This permanently deletes{" "}
				{org.projectCount === null
					? "every project"
					: `${org.projectCount} project${org.projectCount === 1 ? "" : "s"}`}
				, every asset, member, and pending invitation in this organization. This can&apos;t be
				undone.
			</p>
			<FormError
				message={remove.error ? errorMessage(remove.error, "Could not delete organization") : null}
			/>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger
					render={
						<Button variant="secondary" className="w-fit">
							Delete organization
						</Button>
					}
				/>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete &quot;{org.name}&quot;?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the organization, its projects, assets, members, and pending
							invitations. This can&apos;t be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={remove.isLoading} onClick={handleDelete}>
							Delete organization
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

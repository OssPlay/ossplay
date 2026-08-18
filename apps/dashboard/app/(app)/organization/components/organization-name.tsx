"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { OrgLike } from "../hooks/use-resolved-org";

export function OrganizationName({ org, onSaved }: { org: OrgLike; onSaved: () => void }) {
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

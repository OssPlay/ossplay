"use client";

import { useRouter } from "next/navigation";
import { type SyntheticEvent, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { CardDescription } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";

// The only required onboarding step — an instance needs at least one
// organization before the dashboard itself is useful for anything.
export default function OnboardingOrganizationStep() {
	const router = useRouter();
	const [name, setName] = useState("");

	const createOrg = useAction(
		() => apiFetch("/organizations", { method: "POST", body: JSON.stringify({ name }) }),
		{ error: "Could not create organization" },
	);

	async function handleSubmit(event: SyntheticEvent) {
		event.preventDefault();
		await createOrg
			.trigger()
			.then(() => {
				router.push("/");
				router.refresh();
			})
			.catch(() => {});
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<CardDescription>Create your first organization to finish setup.</CardDescription>
			<FormField
				id="orgName"
				label="Organization name"
				value={name}
				onChange={setName}
				required
				autoFocus
				disabled={createOrg.isLoading}
			/>
			<FormError
				message={
					createOrg.error ? errorMessage(createOrg.error, "Could not create organization") : null
				}
			/>
			<LoadingButton
				type="submit"
				loading={createOrg.isLoading}
				loadingText="Creating…"
				onClick={handleSubmit}
				disabled={!name}
			>
				Finish setup
			</LoadingButton>
		</form>
	);
}

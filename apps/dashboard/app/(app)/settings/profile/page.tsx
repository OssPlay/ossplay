"use client";

import { Building2Icon, UserIcon } from "lucide-react";
import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import Container from "@/components/ui/container";
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
import { apiFetch, errorMessage } from "@/lib/api";

export default function ProfilePage() {
	const { user, organizations, isLoading, mutate } = useAuth();

	return (
		<ApiLoader isLoading={isLoading}>
			<Container
				header={{
					icon: UserIcon,
					title: "Profile",
					description: "Your name and email address.",
				}}
				size="sm"
			>
				<ProfileForm name={user.name} email={user.email} onSaved={() => mutate()} />
			</Container>
			<Container
				header={{
					icon: Building2Icon,
					title: "Organizations",
					description: "Every organization you're a member of.",
				}}
				size="sm"
			>
				<OrganizationsTable organizations={organizations} />
			</Container>
		</ApiLoader>
	);
}

function ProfileForm({
	name: initialName,
	email,
	onSaved,
}: {
	name: string;
	email: string;
	onSaved: () => void;
}) {
	// Rendered inside ApiLoader, so `initialName` is already the real fetched
	// value by the time this mounts — same as InstanceName in
	// (app)/instance/page.tsx, no seed-once ref dance needed.
	const [name, setName] = useState(initialName);

	const save = useAction(
		() =>
			apiFetch<{ name: string }>("/auth/me", {
				method: "PUT",
				body: JSON.stringify({ name }),
			}),
		{
			success: (res) => {
				onSaved();
				return `Name updated to "${res.name}"`;
			},
			error: "Could not save name",
		},
	);

	return (
		<div className="flex flex-col gap-4">
			<FormField
				id="name"
				label="Name"
				value={name}
				onChange={setName}
				autoComplete="name"
				disabled={save.isLoading}
			/>
			<div className="flex flex-col gap-1.5 w-full">
				<span className="text-base font-medium text-foreground">Email</span>
				<p className="text-sm text-muted-foreground">{email}</p>
			</div>
			<FormError message={save.error ? errorMessage(save.error, "Could not save name") : null} />
			<LoadingButton
				type="button"
				loading={save.isLoading}
				onClick={() => save.trigger()}
				disabled={!name.trim() || name === initialName}
				className="w-fit"
			>
				Save changes
			</LoadingButton>
		</div>
	);
}

function OrganizationsTable({
	organizations,
}: {
	organizations: Array<{ id: string; name: string; role: string }>;
}) {
	if (organizations.length === 0) {
		return <p className="text-sm text-muted-foreground">Not a member of any organization.</p>;
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Organization</TableHead>
					<TableHead>Role</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{organizations.map((org) => (
					<TableRow key={org.id}>
						<TableCell className="max-w-80">
							<span className="block truncate" title={org.name}>
								{org.name}
							</span>
						</TableCell>
						<TableCell className="capitalize">{org.role}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

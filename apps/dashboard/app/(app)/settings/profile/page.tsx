"use client";

import { useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
			<div className="flex flex-col gap-6">
				<ProfileCard name={user.name} email={user.email} onSaved={() => mutate()} />
				<OrganizationsCard organizations={organizations} />
			</div>
		</ApiLoader>
	);
}

function ProfileCard({
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
		<Card>
			<CardHeader>
				<CardTitle>Profile</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
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
			</CardContent>
		</Card>
	);
}

function OrganizationsCard({
	organizations,
}: {
	organizations: Array<{ id: string; name: string; role: string }>;
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
							</TableRow>
						</TableHeader>
						<TableBody>
							{organizations.map((org) => (
								<TableRow key={org.id}>
									<TableCell>{org.name}</TableCell>
									<TableCell className="capitalize">{org.role}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

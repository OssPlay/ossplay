"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { useCurrentOrgId } from "@/lib/current-org";

type Project = { id: string; name: string; orgId: string };

export default function ProjectGeneralPage() {
	const router = useRouter();
	const { projectId } = useParams<{ projectId: string }>();
	const { organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const org = organizations.find((o) => o.id === orgId);
	const { data: projectsData, mutate } = useSWR<{ projects: Project[] }>(
		orgId ? `/organizations/${orgId}/projects` : null,
	);
	const projectList = projectsData?.projects ?? [];
	const project = projectList.find((p) => p.id === projectId);
	// org:delete_projects is owner/admin-only — see permissions.ts. No
	// client-side permission engine exists, this is a direct role check like
	// every other one in this app.
	const canDelete = org?.role !== "member";

	const [name, setName] = useState("");
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	// Seeds the editable field from the fetched value exactly once — a
	// background SWR revalidation must not stomp on what the user is
	// currently typing.
	const seeded = useRef(false);

	useEffect(() => {
		if (project && !seeded.current) {
			setName(project.name);
			seeded.current = true;
		}
	}, [project]);

	const rename = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${orgId}/projects/${projectId}`, {
				method: "PUT",
				body: JSON.stringify({ name }),
			}),
		{ error: "Could not rename project", success: "Project renamed" },
	);

	const remove = useAction(
		() => apiFetch(`/organizations/${orgId}/projects/${projectId}`, { method: "DELETE" }),
		{ success: `"${project?.name}" deleted`, error: "Could not delete project" },
	);

	async function handleRename() {
		await rename
			.trigger()
			.then(() => mutate())
			.catch(() => {});
	}

	async function handleDelete() {
		await remove
			.trigger()
			.then(() => {
				mutate();
				router.replace("/");
			})
			.catch(() => {});
	}

	if (!project) return null;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>General</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<FormField
						id="projectName"
						label="Name"
						value={name}
						onChange={setName}
						disabled={rename.isLoading}
					/>
					<FormError
						message={rename.error ? errorMessage(rename.error, "Could not rename project") : null}
					/>
					<LoadingButton
						loading={rename.isLoading}
						onClick={handleRename}
						disabled={!name.trim() || name === project.name}
					>
						Save
					</LoadingButton>
				</CardContent>
			</Card>

			{canDelete && (
				<Card>
					<CardHeader>
						<CardTitle>Delete project</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<FormError
							message={remove.error ? errorMessage(remove.error, "Could not delete project") : null}
						/>
						{confirmingDelete ? (
							<div className="flex gap-2">
								<LoadingButton
									variant="destructive"
									loading={remove.isLoading}
									onClick={handleDelete}
								>
									Confirm delete
								</LoadingButton>
								<Button
									variant="ghost"
									onClick={() => setConfirmingDelete(false)}
									disabled={remove.isLoading}
								>
									Cancel
								</Button>
							</div>
						) : (
							<Button variant="outline" onClick={() => setConfirmingDelete(true)}>
								Delete project
							</Button>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

"use client";

import { DatabaseIcon, SettingsIcon, TriangleAlertIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Container from "@/components/ui/container";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { useProjectContext } from "@/lib/current-project";
import type { Destination, Project } from "@/types/projects";

// Same sentinel/reasoning as components/create-project-dialog.tsx.
const LOCAL_DRIVE_VALUE = "__local__";

export default function ProjectGeneralPage() {
	const router = useRouter();
	const { projectId } = useParams<{ projectId: string }>();
	const { org, effectiveOrgId } = useProjectContext(projectId);

	const { data: projectsData, mutate } = useSWR<{ projects: Project[] }>(
		effectiveOrgId ? `/organizations/${effectiveOrgId}/projects` : null,
	);
	const projectList = projectsData?.projects ?? [];
	const project = projectList.find((p) => p.id === projectId);

	const { data: destinationsData } = useSWR<{ destinations: Destination[] }>(
		effectiveOrgId ? `/organizations/${effectiveOrgId}/s3-destinations?per_page=100` : null,
	);
	const matchingDestinations = (destinationsData?.destinations ?? []).filter(
		(d) => d.visibility === project?.visibility,
	);
	// org:delete_projects is owner/admin-only — see permissions.ts. No
	// client-side permission engine exists, this is a direct role check like
	// every other one in this app.
	const canDelete = org?.role !== "member";

	const [name, setName] = useState("");
	const [destinationId, setDestinationId] = useState("");
	// Seeds the editable fields from the fetched values exactly once — a
	// background SWR revalidation must not stomp on what the user is
	// currently typing.
	const seeded = useRef(false);

	useEffect(() => {
		if (project && !seeded.current) {
			setName(project.name);
			setDestinationId(project.destinationId ?? LOCAL_DRIVE_VALUE);
			seeded.current = true;
		}
	}, [project]);

	const rename = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${effectiveOrgId}/projects/${projectId}`, {
				method: "PUT",
				body: JSON.stringify({ name }),
			}),
		{ error: "Could not rename project", success: "Project renamed" },
	);

	const changeDestination = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${effectiveOrgId}/projects/${projectId}`, {
				method: "PUT",
				body: JSON.stringify({
					destinationId: destinationId === LOCAL_DRIVE_VALUE ? null : destinationId,
				}),
			}),
		{ error: "Could not change destination", success: "Storage destination updated" },
	);

	const remove = useAction(
		() => apiFetch(`/organizations/${effectiveOrgId}/projects/${projectId}`, { method: "DELETE" }),
		{ success: `"${project?.name}" deleted`, error: "Could not delete project" },
	);

	async function handleRename() {
		await rename
			.trigger()
			.then(() => mutate())
			.catch(() => {});
	}

	async function handleChangeDestination() {
		await changeDestination
			.trigger()
			.then(() => mutate())
			.catch(() => {});
	}

	function handleDelete() {
		return remove.trigger().then(() => {
			mutate();
			router.replace("/");
		});
	}

	if (!project) return null;

	return (
		<div className="flex flex-col gap-6">
			<Container header={{ icon: SettingsIcon, title: "General" }} size="sm">
				<div className="flex flex-col gap-4">
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
				</div>
			</Container>

			<Container header={{ icon: DatabaseIcon, title: "Storage" }} size="sm">
				<div className="flex flex-col gap-4">
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground">Visibility</span>
						<Badge variant="outline" className="capitalize">
							{project.visibility}
						</Badge>
						<span className="text-xs text-muted-foreground">— permanent, set at creation</span>
					</div>
					<div className="flex flex-col gap-1.5 w-full sm:w-80">
						<Label htmlFor="projectDestination">Storage</Label>
						<Select
							value={destinationId}
							onValueChange={(value) => setDestinationId(value ?? LOCAL_DRIVE_VALUE)}
							disabled={changeDestination.isLoading}
						>
							<SelectTrigger id="projectDestination" className="w-full">
								<SelectValue
									items={{
										[LOCAL_DRIVE_VALUE]: "Local Drive",
										...Object.fromEntries(matchingDestinations.map((d) => [d.id, d.label])),
									}}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={LOCAL_DRIVE_VALUE}>Local Drive</SelectItem>
								{matchingDestinations.map((d) => (
									<SelectItem key={d.id} value={d.id}>
										{d.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<p className="text-xs text-muted-foreground">
						New files go to whichever destination is current. Files already stored under a previous
						destination don't move.
					</p>
					<FormError
						message={
							changeDestination.error
								? errorMessage(changeDestination.error, "Could not change destination")
								: null
						}
					/>
					<LoadingButton
						loading={changeDestination.isLoading}
						onClick={handleChangeDestination}
						disabled={destinationId === (project.destinationId ?? LOCAL_DRIVE_VALUE)}
					>
						Save
					</LoadingButton>
				</div>
			</Container>

			{canDelete && (
				<Container header={{ icon: TriangleAlertIcon, title: "Delete project" }} size="sm">
					<div className="flex flex-col gap-4">
						<FormError
							message={remove.error ? errorMessage(remove.error, "Could not delete project") : null}
						/>
						<ConfirmDialog
							trigger={
								<Button variant="outline" className="w-fit">
									Delete project
								</Button>
							}
							title={`Delete "${project.name}"?`}
							description="This permanently deletes the project, its folders, and every file in it. This can't be undone."
							confirmLabel="Delete project"
							loading={remove.isLoading}
							onConfirm={handleDelete}
						/>
					</div>
				</Container>
			)}
		</div>
	);
}

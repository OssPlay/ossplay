"use client";

import { SettingsIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { useProjectDetail } from "@/hooks/use-project-detail";
import { apiFetch, errorMessage } from "@/lib/api";
import type { Project } from "@/types/projects";

export default function ProjectGeneralPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const { mutate: mutateAuth } = useAuth();
	const { project, effectiveOrgId, mutate } = useProjectDetail(projectId);

	const [name, setName] = useState("");
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
			apiFetch<{ project: Project }>(`/organizations/${effectiveOrgId}/projects/${projectId}`, {
				method: "PUT",
				body: JSON.stringify({ name }),
			}),
		{ error: "Could not rename project", success: "Project renamed" },
	);

	async function handleRename() {
		await rename
			.trigger()
			.then(() => {
				mutate();
				// The project name also lives in organizations[].projects
				// (/auth/me) — the sidebar's project-list.tsx reads from there and
				// would otherwise keep showing the old name until an unrelated
				// remount/refocus.
				mutateAuth();
			})
			.catch(() => {});
	}

	if (!project) return null;

	return (
		<Container
			header={{
				icon: SettingsIcon,
				title: "General",
				description: "This project's display name.",
			}}
			size="sm"
		>
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
	);
}

"use client";

import { DatabaseIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
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
import { useProjectDetail } from "@/hooks/use-project-detail";
import { apiFetch, errorMessage } from "@/lib/api";
import type { Destination, Project } from "@/types/projects";

// Same sentinel/reasoning as components/create-project-dialog.tsx.
const LOCAL_DRIVE_VALUE = "__local__";

export default function ProjectStoragePage() {
	const { projectId } = useParams<{ projectId: string }>();
	const { project, effectiveOrgId, mutate } = useProjectDetail(projectId);

	const { data: destinationsData } = useSWR<{ destinations: Destination[] }>(
		effectiveOrgId ? `/organizations/${effectiveOrgId}/s3-destinations?per_page=100` : null,
	);
	const matchingDestinations = (destinationsData?.destinations ?? []).filter(
		(d) => d.visibility === project?.visibility,
	);

	const [destinationId, setDestinationId] = useState("");
	// Seeds the editable field from the fetched value exactly once — a
	// background SWR revalidation must not stomp on what the user is
	// currently choosing.
	const seeded = useRef(false);

	useEffect(() => {
		if (project && !seeded.current) {
			setDestinationId(project.destinationId ?? LOCAL_DRIVE_VALUE);
			seeded.current = true;
		}
	}, [project]);

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

	async function handleChangeDestination() {
		await changeDestination
			.trigger()
			.then(() => mutate())
			.catch(() => {});
	}

	if (!project) return null;

	return (
		<Container
			header={{
				icon: DatabaseIcon,
				title: "Storage",
				description: "Where this project's files are stored.",
			}}
			size="sm"
		>
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
	);
}

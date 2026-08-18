"use client";

import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { slugify } from "@/lib/slugify";
import type { Destination, Project, Visibility } from "@/types/projects";

const VISIBILITY_LABELS: Record<Visibility, string> = {
	private: "Private — only accessible with a signed URL",
	public: "Public — served directly, no auth needed",
};

// Sentinel for the always-available fallback backend — never a real
// s3Destinations row, translated to `destinationId: null` on submit (see
// packages/core/src/storage/resolve.ts). Not filtered by visibility like
// real destinations are: local disk works the same for public and private
// projects.
const LOCAL_DRIVE_VALUE = "__local__";

// Shared by both places a project can be created (organization/projects's
// full management page and the sidebar's quick-create) — collecting id/
// visibility/destination in two independently-hand-rolled forms would mean
// duplicating the slugify-on-type + destination-filtering logic twice.
export function CreateProjectDialog({
	orgId,
	open,
	onOpenChange,
	onCreated,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [name, setName] = useState("");
	const [id, setId] = useState("");
	const [idTouched, setIdTouched] = useState(false);
	const [visibility, setVisibility] = useState<Visibility>("private");

	// Large enough that the destination picker below won't silently miss any
	// real org's destination list without needing its own unpaginated
	// endpoint just for this — same reasoning as instance/servers's SSH-key
	// picker.
	const { data: destinationsData } = useSWR<{ destinations: Destination[] }>(
		open ? `/organizations/${orgId}/s3-destinations?per_page=100` : null,
	);
	const destinations = destinationsData?.destinations ?? [];
	const matchingDestinations = destinations.filter((d) => d.visibility === visibility);
	const [destinationId, setDestinationId] = useState(LOCAL_DRIVE_VALUE);

	const createProject = useAction(
		() =>
			apiFetch<{ project: Project }>(`/organizations/${orgId}/projects`, {
				method: "POST",
				body: JSON.stringify({
					name,
					id,
					visibility,
					destinationId: destinationId === LOCAL_DRIVE_VALUE ? null : destinationId,
				}),
			}),
		{ success: (res) => `"${res.project.name}" created`, error: "Could not create project" },
	);

	function handleNameChange(next: string) {
		setName(next);
		if (!idTouched) setId(slugify(next));
	}

	function handleIdChange(next: string) {
		setIdTouched(true);
		setId(next);
	}

	// Reset on close, not open: both callers (organization/projects's header
	// button and the sidebar's project-list quick-create) set `open` directly,
	// bypassing this handler entirely, so a reset-on-open branch never
	// actually runs — the dialog would reopen still showing the previous
	// project's values. Every close path does go through this handler.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setName("");
			setId("");
			setIdTouched(false);
			setVisibility("private");
			setDestinationId(LOCAL_DRIVE_VALUE);
			createProject.reset();
		}
		onOpenChange(next);
	}

	function handleVisibilityChange(next: Visibility) {
		setVisibility(next);
		// The previously-picked destination may not match the new visibility
		// — reset to the always-valid local-drive fallback rather than
		// silently submitting a stale, now-invalid real destination id.
		setDestinationId(LOCAL_DRIVE_VALUE);
	}

	async function handleCreate() {
		await createProject
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onCreated();
			})
			.catch(() => {});
	}

	const canSubmit = name.trim() && id && destinationId;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<FormField
						id="newProjectName"
						label="Name"
						value={name}
						onChange={handleNameChange}
						autoFocus
						disabled={createProject.isLoading}
					/>
					<FormField
						id="newProjectId"
						label="Project ID"
						value={id}
						onChange={handleIdChange}
						autoComplete="off"
						disabled={createProject.isLoading}
					/>
					<p className="-mt-2 text-xs text-muted-foreground">
						Lowercase letters, numbers, and hyphens. Unique across the whole instance and permanent
						— it's used to organize this project's files in S3.
					</p>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="newProjectVisibility">Visibility</Label>
						<Select
							value={visibility}
							onValueChange={(value) => {
								if (value) handleVisibilityChange(value as Visibility);
							}}
							disabled={createProject.isLoading}
						>
							<SelectTrigger id="newProjectVisibility" className="w-full">
								<SelectValue items={VISIBILITY_LABELS} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="private">{VISIBILITY_LABELS.private}</SelectItem>
								<SelectItem value="public">{VISIBILITY_LABELS.public}</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">Permanent — can't be changed later.</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="newProjectDestination">Storage</Label>
						<Select
							value={destinationId}
							onValueChange={(value) => setDestinationId(value ?? LOCAL_DRIVE_VALUE)}
							disabled={createProject.isLoading}
						>
							<SelectTrigger id="newProjectDestination" className="w-full">
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
						<p className="text-xs text-muted-foreground">
							{matchingDestinations.length === 0
								? `No ${visibility} S3 destination configured yet — files store on the instance's local disk until you add one.`
								: "Files store on the instance's local disk unless you pick an S3 destination."}
						</p>
					</div>
					<FormError
						message={
							createProject.error
								? errorMessage(createProject.error, "Could not create project")
								: null
						}
					/>
				</div>
				<DialogFooter>
					<LoadingButton
						loading={createProject.isLoading}
						onClick={handleCreate}
						disabled={!canSubmit}
					>
						Create
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

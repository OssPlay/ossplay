"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Container from "@/components/ui/container";
import { useAction } from "@/hooks/use-action";
import { useProjectDetail } from "@/hooks/use-project-detail";
import { apiFetch, errorMessage } from "@/lib/api";

export default function ProjectDangerZonePage() {
	const router = useRouter();
	const { projectId } = useParams<{ projectId: string }>();
	const { mutate: mutateAuth } = useAuth();
	const { project, org, effectiveOrgId, mutate } = useProjectDetail(projectId);

	// org:delete_projects is owner/admin-only — see permissions.ts. No
	// client-side permission engine exists, this is a direct role check like
	// every other one in this app.
	const canDelete = org?.role !== "member";

	const remove = useAction(
		() => apiFetch(`/organizations/${effectiveOrgId}/projects/${projectId}`, { method: "DELETE" }),
		{ success: `"${project?.name}" deleted`, error: "Could not delete project" },
	);

	function handleDelete() {
		return remove.trigger().then(() => {
			mutate();
			// The deleted project also lives in organizations[].projects
			// (/auth/me) — the sidebar's project-list.tsx reads from there and
			// the project access check in lib/current-project.ts both need this
			// refreshed before navigating away, not after an unrelated remount.
			mutateAuth();
			router.replace("/");
		});
	}

	if (!project || !canDelete) return null;

	return (
		<Container
			header={{
				icon: TriangleAlertIcon,
				title: "Delete project",
				description: "Permanently remove this project, its folders, and every file in it.",
			}}
			size="sm"
			variant="destructive"
		>
			<div className="flex flex-col gap-4">
				<FormError
					message={remove.error ? errorMessage(remove.error, "Could not delete project") : null}
				/>
				<ConfirmDialog
					trigger={
						<Button variant="destructive" className="w-fit">
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
	);
}

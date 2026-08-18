"use client";

import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import type { OrgLike } from "../hooks/use-resolved-org";

export function DeleteOrganization({ org, onDeleted }: { org: OrgLike; onDeleted: () => void }) {
	const remove = useAction(() => apiFetch(`/organizations/${org.id}`, { method: "DELETE" }), {
		success: `"${org.name}" deleted`,
		error: "Could not delete organization",
	});

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				This permanently deletes{" "}
				{org.projectCount === null
					? "every project"
					: `${org.projectCount} project${org.projectCount === 1 ? "" : "s"}`}
				, every asset, member, and pending invitation in this organization. This can&apos;t be
				undone.
			</p>
			<FormError
				message={remove.error ? errorMessage(remove.error, "Could not delete organization") : null}
			/>
			<ConfirmDialog
				trigger={
					<Button variant="secondary" className="w-fit">
						Delete organization
					</Button>
				}
				title={`Delete "${org.name}"?`}
				description="This permanently deletes the organization, its projects, assets, members, and pending invitations. This can't be undone."
				confirmLabel="Delete organization"
				loading={remove.isLoading}
				onConfirm={() => remove.trigger().then(onDeleted)}
			/>
		</div>
	);
}

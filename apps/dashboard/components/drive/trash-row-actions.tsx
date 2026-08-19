"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Text-label row actions, matching every other admin table's row-action
// convention (servers/smtp/ssh-keys/destinations/members) — this used to be
// the one icon-only pair (with Tippy tooltips) in an otherwise text-button
// codebase.
export function TrashRowActions({
	onRestore,
	onDeleteForever,
	restoring,
	deleting,
	label,
}: {
	onRestore: () => void;
	onDeleteForever: () => Promise<unknown>;
	restoring?: boolean;
	deleting?: boolean;
	label: string;
}) {
	return (
		<div className="flex justify-end gap-2">
			<Button variant="ghost" size="sm" disabled={restoring} onClick={onRestore}>
				Restore
			</Button>
			<ConfirmDialog
				trigger={
					<Button variant="destructive" size="sm">
						Delete forever
					</Button>
				}
				title={`Delete "${label}" forever?`}
				description="This can't be undone."
				confirmLabel="Delete forever"
				loading={deleting}
				onConfirm={onDeleteForever}
			/>
		</div>
	);
}

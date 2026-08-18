"use client";

// The seed-once-then-freely-editable pattern repeated across every Add/
// Create dialog in the dashboard (CreateProjectDialog, AddDestinationDialog,
// CreateOrgDialog, AddSshKeyDialog, AddRemoteWorkerDialog, SmtpConfigDialog,
// CreateFolderDialog, InviteUserDialog, and others): reset all form state
// (and the underlying `useAction` mutation) only when the dialog CLOSES,
// never on open — every caller sets `open` directly from a header button,
// bypassing a reset-on-open branch entirely, so the dialog would otherwise
// reopen still showing the previous submission's values.
//
// Deliberately doesn't own the individual form fields (every dialog's
// fields differ) — the caller keeps its own useState calls and passes a
// `resetFields` callback that clears all of them. This hook only
// standardizes the two things every one of these dialogs re-implements
// identically: the open/close reset, and "submit, then close + notify on
// success, swallow the rejection on failure" (the dialog's own `error` state
// already renders the failure — nothing else needs to react to it).
export function useDialogForm({
	onOpenChange,
	resetFields,
	action,
}: {
	onOpenChange: (open: boolean) => void;
	resetFields: () => void;
	action: { reset: () => void };
}) {
	function handleOpenChange(next: boolean): void {
		if (!next) {
			resetFields();
			action.reset();
		}
		onOpenChange(next);
	}

	async function handleSubmit<T>(trigger: () => Promise<T>, onSuccess?: (result: T) => void) {
		await trigger()
			.then((result) => {
				handleOpenChange(false);
				onSuccess?.(result);
			})
			.catch(() => {});
	}

	return { handleOpenChange, handleSubmit };
}

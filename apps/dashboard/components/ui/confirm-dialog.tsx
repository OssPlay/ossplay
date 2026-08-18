"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// The destructive-confirm AlertDialog pattern repeated across every delete/
// remove/revoke action in the dashboard: a trigger, a title + description,
// Cancel + a destructive Action button wired to a loading mutation. Owns its
// own open state so callers don't each need their own useState<boolean> just
// to close it after a successful confirm — closes only on success, same as
// every hand-rolled version did (`onConfirm` rejecting, e.g. the API call
// failing, leaves it open so the user can retry; the underlying `useAction`
// already surfaces the error via toast, so this swallows it rather than
// showing a second error UI).
//
// `trigger` is the complete trigger element, children included (a plain
// `<Button variant="secondary" size="sm">Remove</Button>`, an icon-only
// button, a `Tippy`-wrapped one, etc.) — passed straight to
// `AlertDialogTrigger`'s `render` prop.
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel = "Remove",
	onConfirm,
	loading,
}: {
	trigger: ReactElement;
	title: string;
	description?: string;
	confirmLabel?: string;
	onConfirm: () => unknown;
	loading?: boolean;
}) {
	const [open, setOpen] = useState(false);

	async function handleConfirm() {
		try {
			await onConfirm();
			setOpen(false);
		} catch {
			// Swallowed — the caller's own action already surfaced the error via
			// toast; leave the dialog open so the user can retry.
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={trigger} />
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && <AlertDialogDescription>{description}</AlertDialogDescription>}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" disabled={loading} onClick={handleConfirm}>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

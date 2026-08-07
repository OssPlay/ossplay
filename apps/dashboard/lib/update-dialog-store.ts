import { useSyncExternalStore } from "react";

// Global open/closed flag for components/providers/update-apply-dialog.tsx —
// same tiny external-store shape as lib/current-org.ts, just without
// sessionStorage persistence (there's nothing to remember across a reload;
// re-opening after a refresh is a fresh decision). This is what lets the
// dialog be triggered from anywhere (the sidebar footer, the instance
// page's "Update now" button) while staying a single component mounted
// once in AuthProvider, rather than a duplicated one per trigger site.
let isOpen = false;
const listeners = new Set<() => void>();

function notify(): void {
	for (const listener of listeners) listener();
}

export function openUpdateDialog(): void {
	isOpen = true;
	notify();
}

export function closeUpdateDialog(): void {
	isOpen = false;
	notify();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useUpdateDialogOpen(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => isOpen,
		() => false,
	);
}

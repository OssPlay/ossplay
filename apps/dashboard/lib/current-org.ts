import { useSyncExternalStore } from "react";
import { useAuth } from "@/components/providers/auth-provider";

// sessionStorage, not localStorage — each browser TAB gets its own current
// org, so two tabs can browse different orgs without one silently
// overwriting the other's selection through a shared key.
const STORAGE_KEY = "ossplay:currentOrgId";

const listeners = new Set<() => void>();

function readStored(): string | null {
	if (typeof window === "undefined") return null;
	return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setCurrentOrgId(orgId: string): void {
	window.sessionStorage.setItem(STORAGE_KEY, orgId);
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	window.addEventListener("storage", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("storage", listener);
	};
}

/**
 * Returns the stored org id if it's still in `availableOrgIds`, otherwise
 * falls back to the first available org (and persists that fallback) — the
 * same "just use the first org" behavior every org-scoped page already had
 * before there was any real switching, just made explicit and correctable.
 *
 * `allowAny` trusts the stored id even when it's outside `availableOrgIds`
 * — for root managing an organization it isn't a member of (no membership
 * row means it never appears in `availableOrgIds`, which only reflects
 * `/auth/me`'s real membership rows), navigated to via
 * instance/organizations/[id]'s "Manage" links, which call
 * `setCurrentOrgId` before navigating. Every other caller (org picker,
 * project list, project settings) omits it and keeps the strict
 * membership-only behavior, since a user actually switching their own
 * working context should never land on an org they don't belong to.
 */
export function useCurrentOrgId(
	availableOrgIds: string[] | undefined,
	options?: { allowAny?: boolean },
): string | null {
	const stored = useSyncExternalStore(subscribe, readStored, () => null);
	if (options?.allowAny && stored) return stored;
	if (!availableOrgIds || availableOrgIds.length === 0) return null;
	if (stored && availableOrgIds.includes(stored)) return stored;
	return availableOrgIds[0] ?? null;
}

/**
 * The org-management section's current org id — layout.tsx, page.tsx,
 * members/page.tsx, and projects/page.tsx under app/(app)/organization/ all
 * resolved this via the exact same `useCurrentOrgId(organizations.map(...),
 * { allowAny: ... })` three-liner (4 call sites is the repo's own threshold
 * for pulling a repeated pattern out — see CLAUDE.md). Deliberately NOT a
 * replacement for plain `useCurrentOrgId` itself: the org picker, project
 * list, and project settings page all call that directly without `allowAny`
 * and should keep the strict membership-only behavior described on it above
 * — this hook is specific to the one flow that needs root's exception.
 */
export function useOrgSectionId(): string | null {
	const { organizations, user } = useAuth();
	return useCurrentOrgId(
		organizations.map((o) => o.id),
		{ allowAny: user.instanceRole === "root" },
	);
}

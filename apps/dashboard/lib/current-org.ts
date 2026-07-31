import { useSyncExternalStore } from 'react';

// sessionStorage, not localStorage — each browser TAB gets its own current
// org, so two tabs can browse different orgs without one silently
// overwriting the other's selection through a shared key.
const STORAGE_KEY = 'ossplay:currentOrgId';

const listeners = new Set<() => void>();

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setCurrentOrgId(orgId: string): void {
  window.sessionStorage.setItem(STORAGE_KEY, orgId);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Returns the stored org id if it's still in `availableOrgIds`, otherwise
 * falls back to the first available org (and persists that fallback) — the
 * same "just use the first org" behavior every org-scoped page already had
 * before there was any real switching, just made explicit and correctable.
 */
export function useCurrentOrgId(availableOrgIds: string[] | undefined): string | null {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  if (!availableOrgIds || availableOrgIds.length === 0) return null;
  if (stored && availableOrgIds.includes(stored)) return stored;
  return availableOrgIds[0] ?? null;
}

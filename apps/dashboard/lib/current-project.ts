import { useSyncExternalStore } from 'react';

// Same per-tab sessionStorage shape as lib/current-org.ts, one level down —
// validated against the *current org's* project list, so switching org
// naturally invalidates a stale project id from a different org.
const STORAGE_KEY = 'ossplay:currentProjectId';

const listeners = new Set<() => void>();

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(STORAGE_KEY);
}

export function setCurrentProjectId(projectId: string): void {
  window.sessionStorage.setItem(STORAGE_KEY, projectId);
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

export function useCurrentProjectId(availableProjectIds: string[] | undefined): string | null {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  if (!availableProjectIds || availableProjectIds.length === 0) return null;
  if (stored && availableProjectIds.includes(stored)) return stored;
  return availableProjectIds[0] ?? null;
}

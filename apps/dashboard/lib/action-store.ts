import { useSyncExternalStore } from 'react';

// Global registry of in-flight actions (id -> optional label), so any
// component can know "is anything happening right now" without prop
// drilling — used to block the browser tab from being closed/reloaded
// (components/action-guard.tsx) and to disable the Logout button while an
// action is running. A plain module-level store rather than a Zustand
// dependency — small enough that useSyncExternalStore covers it exactly.
const activeActions = new Map<string, string | undefined>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function beginAction(id: string, label?: string): void {
  activeActions.set(id, label);
  notify();
}

export function endAction(id: string): void {
  activeActions.delete(id);
  notify();
}

export function getActiveActionCount(): number {
  return activeActions.size;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveActionCount(): number {
  return useSyncExternalStore(subscribe, getActiveActionCount, () => 0);
}

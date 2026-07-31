import { useSyncExternalStore } from 'react';
import type { Breadcrumbs, Sidepanel } from '@/lib/nav-types';

// Registered by components/layout/section.tsx, one entry per mounted
// <Section>. `depth` (0 = the root (app) layout, increasing per nested
// Section) is what determines "which registration is currently the active
// one" — NOT registration order. React fires effect setup functions
// bottom-up (a child's effect runs before its parent's on mount), so a
// child <Section> can register before its parent does; picking "last
// registered" would then pick the wrong one. Picking "max depth" is
// correct regardless of effect ordering. `breadcrumbs` on each entry is
// already the full accumulated chain (Section resolves that via React
// context during render, not from this store), so display is just
// "read the deepest entry" — no flattening needed here.
interface SectionRegistration {
  depth: number;
  breadcrumbs: Breadcrumbs;
  sidepanel?: Sidepanel;
}

const registrations = new Map<string, SectionRegistration>();
const listeners = new Set<() => void>();

let version = 0;
function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

export function registerSection(id: string, registration: SectionRegistration): void {
  registrations.set(id, registration);
  notify();
}

export function unregisterSection(id: string): void {
  registrations.delete(id);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore requires a stable snapshot reference when nothing
// changed (returning a freshly-allocated value on every call trips React's
// "getSnapshot should be cached" warning/loop) — these cache their result
// and only recompute when `version` has actually moved since last read.
let breadcrumbsVersion = -1;
let cachedBreadcrumbs: Breadcrumbs = [];
function getBreadcrumbs(): Breadcrumbs {
  if (breadcrumbsVersion !== version) {
    let deepest: SectionRegistration | undefined;
    for (const r of registrations.values()) {
      if (!deepest || r.depth > deepest.depth) deepest = r;
    }
    cachedBreadcrumbs = deepest?.breadcrumbs ?? [];
    breadcrumbsVersion = version;
  }
  return cachedBreadcrumbs;
}

let sidepanelVersion = -1;
let cachedSidepanel: Sidepanel | undefined;
function getSidepanel(): Sidepanel | undefined {
  if (sidepanelVersion !== version) {
    let deepest: SectionRegistration | undefined;
    for (const r of registrations.values()) {
      if (r.sidepanel && (!deepest || r.depth > deepest.depth)) deepest = r;
    }
    cachedSidepanel = deepest?.sidepanel;
    sidepanelVersion = version;
  }
  return cachedSidepanel;
}

// A stable constant, not an inline `() => []` — a fresh array literal
// returned on every SSR snapshot call trips React's "getServerSnapshot
// should be cached" warning (Object.is(prev, next) is never true).
const EMPTY_BREADCRUMBS: Breadcrumbs = [];

export function useBreadcrumbs(): Breadcrumbs {
  return useSyncExternalStore(subscribe, getBreadcrumbs, () => EMPTY_BREADCRUMBS);
}

export function useSidepanel(): Sidepanel | undefined {
  return useSyncExternalStore(subscribe, getSidepanel, () => undefined);
}

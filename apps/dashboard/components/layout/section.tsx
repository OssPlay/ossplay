'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useId } from 'react';
import { registerSection, unregisterSection } from '@/lib/nav-store';
import type { BreadcrumbItem, Breadcrumbs, Sidepanel } from '@/lib/nav-types';

interface SectionContextValue {
  breadcrumbs: Breadcrumbs;
  depth: number;
}

// Read during render (not from the external nav-store, which only knows
// about *mounted* Sections and in what order their effects happened to
// fire) — this is what lets a nested <Section> see its correct ancestor
// chain synchronously, regardless of React's bottom-up effect ordering.
const SectionContext = createContext<SectionContextValue>({ breadcrumbs: [], depth: 0 });

export interface SectionProps {
  /** Replaces the left rail's content while this Section is mounted. Omit to inherit whatever the nearest ancestor Section provided. */
  sidepanel?: Sidepanel;
  /** A static crumb (or crumbs), or a function receiving the accumulated parent chain — mirrors `generateMetadata(parent)`. */
  breadcrumb?: BreadcrumbItem | Breadcrumbs | ((parent: Breadcrumbs) => Breadcrumbs);
  /** undefined = still resolving (renders nothing yet), false = redirect away, true = render children. Default true — most callers don't need gating. */
  access?: boolean;
  redirectTo?: string;
  children: React.ReactNode;
}

function resolveBreadcrumb(
  breadcrumb: SectionProps['breadcrumb'],
  parent: Breadcrumbs,
): Breadcrumbs {
  if (!breadcrumb) return [];
  if (typeof breadcrumb === 'function') return breadcrumb(parent);
  return Array.isArray(breadcrumb) ? breadcrumb : [breadcrumb];
}

export function Section({
  sidepanel,
  breadcrumb,
  access = true,
  redirectTo = '/',
  children,
}: SectionProps) {
  const id = useId();
  const router = useRouter();
  const parent = useContext(SectionContext);

  const depth = parent.depth + 1;
  const fullBreadcrumbs = [
    ...parent.breadcrumbs,
    ...resolveBreadcrumb(breadcrumb, parent.breadcrumbs),
  ];

  useEffect(() => {
    registerSection(id, { depth, breadcrumbs: fullBreadcrumbs, sidepanel });
    return () => unregisterSection(id);
    // biome-ignore lint/correctness/useExhaustiveDependencies: fullBreadcrumbs/sidepanel are fresh objects each render by design (callers pass inline literals) — re-registering on every render is harmless (idempotent), the id/depth/content is what actually matters.
  }, [id, depth, fullBreadcrumbs, sidepanel]);

  useEffect(() => {
    if (access === false) router.replace(redirectTo);
  }, [access, redirectTo, router]);

  if (access === false || access === undefined) return null;

  return (
    <SectionContext.Provider value={{ breadcrumbs: fullBreadcrumbs, depth }}>
      {children}
    </SectionContext.Provider>
  );
}

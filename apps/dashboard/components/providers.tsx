'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { ThemeProvider } from '@/components/theme-provider';
import { apiFetch } from '@/lib/api';

// Context-only wrapper — no DOM of its own, so it stays outside <body> in
// app/layout.tsx exactly like ThemeProvider did before. Toaster/ActionGuard
// render *inside* <body> (in layout.tsx directly), not here, since they
// need to be part of the body's own children, not siblings of it.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher: apiFetch }}>{children}</SWRConfig>
    </ThemeProvider>
  );
}

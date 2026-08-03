"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ActionGuard } from "@/components/providers/action-guard";
import { Toaster } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/api";
import { TooltipProvider } from "../ui/tooltip";
import { ThemeProvider } from "./theme-provider";

// Context-only wrapper — no DOM of its own, so it stays outside <body> in
// app/layout.tsx exactly like ThemeProvider did before. Toaster/ActionGuard
// render *inside* <body> (in layout.tsx directly), not here, since they
// need to be part of the body's own children, not siblings of it.
export function Providers({ children }: { children: ReactNode }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
			<TooltipProvider>
				<SWRConfig value={{ fetcher: apiFetch }}>
					{children}
					<Toaster />
					<ActionGuard />
				</SWRConfig>
			</TooltipProvider>
		</ThemeProvider>
	);
}

"use client";

import { HomeIcon, SettingsIcon } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Section } from "@/components/layout/section";
import AuthProvider, { useAuth } from "@/components/providers/auth-provider";
import { RenderErrorBoundary } from "@/components/providers/render-error-boundary";
import { TransferProvider, useTransfer } from "@/components/providers/transfer-provider";
import { TransferPopover } from "@/components/transfer-popover";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Sidepanel } from "@/lib/nav-types";

// Reads useAuth(), so it has to render inside <AuthProvider> — Layout below
// mounts AuthProvider itself, so this can't just be inlined there.
function DefaultSection({ children }: React.PropsWithChildren) {
	const { organizations } = useAuth();

	const sidepanel: Sidepanel = [
		{ title: "Overview", href: "/", icon: HomeIcon },
		// Nothing to manage yet if the account has no organization at all —
		// same signal (app)/page.tsx uses to show its own "no org" states.
		// Root without any org still gets here via instance/organizations
		// instead (see that page), not this quick-nav shortcut.
		...(organizations.length > 0
			? [
					{
						title: "Organization",
						items: [
							{
								title: "Organization settings",
								href: "/organization",
								icon: SettingsIcon,
							},
						],
					},
				]
			: []),
	];

	return <Section sidepanel={sidepanel}>{children}</Section>;
}

// Reads useTransfer() to reserve room for the transfer popover, so a
// scrolled-to-the-bottom list is never hidden behind it — applies here
// (not per-page) so it covers every route, not just Drive.
function ScrollContent({ children }: React.PropsWithChildren) {
	const { popoverHeight } = useTransfer();

	return (
		<div
			className="flex flex-1 flex-col gap-y-4 min-w-0 p-4 transition-[padding-bottom]"
			style={popoverHeight > 0 ? { paddingBottom: popoverHeight + 32 } : undefined}
		>
			<DefaultSection>{children}</DefaultSection>
		</div>
	);
}

export default function Layout({ children }: React.PropsWithChildren) {
	return (
		<RenderErrorBoundary>
			<AuthProvider>
				<TransferProvider>
					<SidebarProvider
						style={
							{
								"--sidebar-width": "19rem",
							} as React.CSSProperties
						}
					>
						<AppSidebar />
						<SidebarInset>
							<AppHeader />
							<ScrollContent>{children}</ScrollContent>
						</SidebarInset>
					</SidebarProvider>
					<TransferPopover />
				</TransferProvider>
			</AuthProvider>
		</RenderErrorBoundary>
	);
}

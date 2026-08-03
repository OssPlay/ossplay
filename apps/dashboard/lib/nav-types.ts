import type { LucideIcon } from "lucide-react";

export interface BreadcrumbItem {
	title: string;
	/** Omitted = current page, rendered non-clickable. */
	href?: string;
	icon?: LucideIcon;
	target?: React.HTMLAttributeAnchorTarget;
}

export type Breadcrumbs = BreadcrumbItem[];

export interface SidepanelItem {
	title: string;
	href: string;
	icon: LucideIcon;
	target?: React.HTMLAttributeAnchorTarget;
}

export interface SidepanelGroup {
	title: string;
	icon?: LucideIcon;
	items: SidepanelItem[];
}

export type Sidepanel = (SidepanelItem | SidepanelGroup)[];

import type { VariantProps } from "class-variance-authority";
import { ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ContainerHeaderAction {
	icon?: LucideIcon;
	title?: string;
	onClick?: () => void;
	variant?: VariantProps<typeof buttonVariants>["variant"];
	disabled?: boolean;
}

export interface ContainerHeaderConfig {
	props?: React.HTMLAttributes<HTMLHeadingElement>;
	icon?: LucideIcon;
	title: string;
	description?: string;
	/** A single header-row action (e.g. "Add key") — most list-style pages need exactly one. */
	action?: ContainerHeaderAction;
	/** Link out to this page's docs guide, shown under the title/description. Omit when there's no matching guide yet — don't link to a page that doesn't exist. */
	learnMore?: { href: string; label?: string };
}

export default function Container({
	inner: { className: innerClassName, ...innerProps } = {},
	container: { className: containerClassName, ...containerProps } = {},
	children,
	className,
	header,
	size,
	...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>> & {
	inner?: React.HTMLAttributes<HTMLDivElement>;
	container?: React.HTMLAttributes<HTMLDivElement>;
	header?: ContainerHeaderConfig;
	size?: "lg" | "md" | "sm";
}) {
	return (
		<section
			{...props}
			className={cn(
				"flex flex-col p-4 border-sidebar-border dark:bg-card bg-muted/50 border rounded-4xl w-full mx-auto",
				className,
				size === "lg" && "max-w-7xl",
				size === "md" && "max-w-5xl",
				size === "sm" && "max-w-3xl",
			)}
		>
			<div
				{...innerProps}
				className={cn(
					"flex flex-1 flex-col bg-background rounded-4xl border border-sidebar-border shadow-lg",
					innerClassName,
				)}
			>
				{header && (
					<header
						className="flex items-center gap-4 p-4 mb-4 border-b flex-nowrap"
						{...header.props}
					>
						{header.icon && <header.icon className="size-8 shrink-0" />}
						<div className="flex flex-col flex-1 min-w-0">
							<h3 className="text-lg font-bold dark:text-white">{header.title}</h3>
							{header.description && (
								<p className="text-sm text-muted-foreground">{header.description}</p>
							)}
							{header.learnMore && (
								<Link
									href={header.learnMore.href}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-sm text-primary hover:underline w-fit"
								>
									{header.learnMore.label ?? "Learn more"}
									<ArrowUpRightIcon className="size-3.5" />
								</Link>
							)}
						</div>
						{header.action && (
							<Button
								variant={header.action.variant ?? "default"}
								size={!header.action.title ? "icon-sm" : "sm"}
								disabled={header.action.disabled}
								onClick={header.action.onClick}
							>
								{header.action.icon && <header.action.icon />}
								{header.action.title}
							</Button>
						)}
					</header>
				)}
				<div className={cn("flex flex-1 flex-col p-4", containerClassName)} {...containerProps}>
					{children}
				</div>
			</div>
		</section>
	);
}

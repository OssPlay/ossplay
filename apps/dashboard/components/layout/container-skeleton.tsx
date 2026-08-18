import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Loading placeholder shaped like Container (components/ui/container.tsx) —
// same frame-within-a-frame structure and header layout — so a page doesn't
// visually jump when real content replaces it.
export default function ContainerSkeleton({
	size,
	header = true,
	rows = 3,
	className,
}: {
	size?: "lg" | "md" | "sm";
	header?: boolean;
	rows?: number;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"flex flex-col p-4 border-sidebar-border dark:bg-card bg-muted/50 border rounded-4xl w-full mx-auto",
				size === "lg" && "max-w-7xl",
				size === "md" && "max-w-5xl",
				size === "sm" && "max-w-3xl",
				className,
			)}
		>
			<div className="flex flex-1 flex-col bg-background rounded-4xl border border-sidebar-border shadow-lg">
				{header && (
					<div className="flex items-center gap-4 p-4 mb-4 border-b flex-nowrap">
						<Skeleton className="size-8 shrink-0 rounded-lg" />
						<div className="flex flex-col flex-1 min-w-0 gap-2">
							<Skeleton className="h-5 w-40" />
							<Skeleton className="h-3.5 w-64" />
						</div>
					</div>
				)}
				<div className="flex flex-1 flex-col gap-3 p-4">
					{Array.from({ length: rows }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder count, order never changes
						<Skeleton key={`row-${i}`} className="h-10 w-full" />
					))}
				</div>
			</div>
		</section>
	);
}

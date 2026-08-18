"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ChartSkeleton() {
	return (
		<div className="aspect-video p-2">
			<Skeleton className="size-full" />
		</div>
	);
}

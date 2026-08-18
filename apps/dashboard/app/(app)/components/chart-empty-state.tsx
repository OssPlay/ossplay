"use client";

export function ChartEmptyState({ message }: { message: string }) {
	return (
		<div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
			{message}
		</div>
	);
}

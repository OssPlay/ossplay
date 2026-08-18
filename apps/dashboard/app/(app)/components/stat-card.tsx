"use client";

import Container from "@/components/ui/container";

export function StatCard({
	icon: Icon,
	label,
	value,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: string | number | undefined;
}) {
	return (
		<Container>
			<div className="flex items-center gap-4 py-2">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
					<Icon className="size-5 text-muted-foreground" />
				</div>
				<div className="flex flex-col">
					<span className="text-2xl font-bold tabular-nums">{value ?? "—"}</span>
					<span className="text-xs text-muted-foreground">{label}</span>
				</div>
			</div>
		</Container>
	);
}

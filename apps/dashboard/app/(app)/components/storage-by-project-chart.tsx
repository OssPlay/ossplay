"use client";

import { DatabaseIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import Container from "@/components/ui/container";
import { formatBytes } from "@/lib/format-bytes";
import { ChartEmptyState } from "./chart-empty-state";
import { ChartSkeleton } from "./chart-skeleton";
import type { OrgStats } from "./types";

const STORAGE_CONFIG: ChartConfig = {
	bytes: { label: "Storage", color: "var(--chart-3)" },
};

export function StorageByProjectChart({ stats }: { stats: OrgStats | undefined }) {
	const top = (stats?.storage.byProject ?? [])
		.slice()
		.sort((a, b) => b.bytes - a.bytes)
		.slice(0, 8);
	const hasStorage = stats && stats.storage.totalBytes > 0;

	return (
		<Container
			header={{
				title: "Storage by project",
				description: "Bytes stored, summed from each project's assets.",
				icon: DatabaseIcon,
			}}
		>
			<div>
				{!stats ? (
					<ChartSkeleton />
				) : !hasStorage ? (
					<ChartEmptyState message="No files stored yet." />
				) : (
					<ChartContainer config={STORAGE_CONFIG} className="max-h-64 w-full">
						<BarChart data={top} layout="vertical" margin={{ left: 8 }}>
							<CartesianGrid horizontal={false} />
							<XAxis type="number" tickFormatter={(v) => formatBytes(v)} hide />
							<YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
							<ChartTooltip
								content={
									<ChartTooltipContent
										hideLabel
										formatter={(value) => formatBytes(Number(value))}
									/>
								}
							/>
							<Bar dataKey="bytes" fill="var(--color-bytes)" radius={4} />
						</BarChart>
					</ChartContainer>
				)}
			</div>
		</Container>
	);
}

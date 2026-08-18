"use client";

import { UploadIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import Container from "@/components/ui/container";
import { ChartEmptyState } from "./chart-empty-state";
import { ChartSkeleton } from "./chart-skeleton";
import type { OrgStats } from "./types";

const ASSETS_CONFIG: ChartConfig = {
	count: { label: "Assets uploaded", color: "var(--chart-2)" },
};

export function AssetsOverTimeChart({ stats }: { stats: OrgStats | undefined }) {
	const data = stats?.assets.createdOverTime ?? [];

	return (
		<Container
			header={{
				title: "Assets uploaded",
				description: "Last 30 days, across every project.",
				icon: UploadIcon,
			}}
		>
			<div>
				{!stats ? (
					<ChartSkeleton />
				) : stats.assets.total === 0 ? (
					<ChartEmptyState message="No assets uploaded yet." />
				) : (
					<ChartContainer config={ASSETS_CONFIG} className="max-h-64 w-full">
						<AreaChart data={data}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickFormatter={(v: string) => v.slice(5)}
							/>
							<YAxis allowDecimals={false} tickLine={false} axisLine={false} />
							<ChartTooltip content={<ChartTooltipContent />} />
							<Area
								dataKey="count"
								type="monotone"
								fill="var(--color-count)"
								stroke="var(--color-count)"
								fillOpacity={0.3}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</div>
		</Container>
	);
}

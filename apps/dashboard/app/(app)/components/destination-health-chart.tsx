"use client";

import { DatabaseZapIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
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

const DESTINATION_CONFIG: ChartConfig = {
	ok: { label: "OK", color: "var(--chart-1)" },
	untested: { label: "Untested", color: "var(--chart-4)" },
	error: { label: "Error", color: "var(--destructive)" },
};

export function DestinationHealthChart({ stats }: { stats: OrgStats | undefined }) {
	const data = stats
		? [
				{
					status: "ok",
					count: stats.destinations.byStatus.ok,
					fill: "var(--chart-1)",
				},
				{
					status: "untested",
					count: stats.destinations.byStatus.untested,
					fill: "var(--chart-4)",
				},
				{
					status: "error",
					count: stats.destinations.byStatus.error,
					fill: "var(--destructive)",
				},
			]
		: [];

	return (
		<Container
			header={{
				title: "S3 destination health",
				description: "Connection status of every configured destination.",
				icon: DatabaseZapIcon,
			}}
		>
			<div>
				{!stats ? (
					<ChartSkeleton />
				) : stats.destinations.total === 0 ? (
					<ChartEmptyState message="No S3 destinations yet — add one in Organization > S3 Destinations." />
				) : (
					<ChartContainer config={DESTINATION_CONFIG} className="max-h-64 w-full">
						<BarChart data={data}>
							<CartesianGrid vertical={false} />
							<XAxis dataKey="status" tickLine={false} axisLine={false} className="capitalize" />
							<YAxis allowDecimals={false} tickLine={false} axisLine={false} />
							<ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
							<Bar dataKey="count" radius={4}>
								{data.map((entry) => (
									<Cell key={entry.status} fill={entry.fill} />
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				)}
			</div>
		</Container>
	);
}

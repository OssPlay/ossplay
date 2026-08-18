"use client";

import { HatGlassesIcon } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { CardContent } from "@/components/ui/card";
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

const VISIBILITY_CONFIG: ChartConfig = {
	public: { label: "Public", color: "var(--chart-1)" },
	private: { label: "Private", color: "var(--chart-2)" },
};

export function ProjectsByVisibilityChart({ stats }: { stats: OrgStats | undefined }) {
	const data = stats
		? [
				{
					visibility: "public",
					count: stats.projects.byVisibility.public,
					fill: "var(--chart-1)",
				},
				{
					visibility: "private",
					count: stats.projects.byVisibility.private,
					fill: "var(--chart-2)",
				},
			]
		: [];
	const total = stats?.projects.total ?? 0;

	return (
		<Container
			header={{
				title: "Projects by visibility",
				description: "Public vs. private across this organization.",
				icon: HatGlassesIcon,
			}}
		>
			<CardContent>
				{!stats ? (
					<ChartSkeleton />
				) : total === 0 ? (
					<ChartEmptyState message="No projects yet — create one to see this chart fill in." />
				) : (
					<ChartContainer config={VISIBILITY_CONFIG} className="mx-auto max-h-64">
						<PieChart>
							<ChartTooltip content={<ChartTooltipContent nameKey="visibility" hideLabel />} />
							<Pie
								data={data}
								dataKey="count"
								nameKey="visibility"
								innerRadius={50}
								strokeWidth={4}
							>
								{data.map((entry) => (
									<Cell key={entry.visibility} fill={entry.fill} />
								))}
							</Pie>
						</PieChart>
					</ChartContainer>
				)}
			</CardContent>
		</Container>
	);
}

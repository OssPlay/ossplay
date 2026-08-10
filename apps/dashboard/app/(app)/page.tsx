"use client";

// Reads currentOrgId (sessionStorage) at runtime and fetches org-scoped
// stats — same reasoning as the other org-scoped pages, see their
// `dynamic = "force-dynamic"` comments.
export const dynamic = "force-dynamic";

import {
	Building2Icon,
	DatabaseIcon,
	DatabaseZapIcon,
	FolderIcon,
	HardDriveIcon,
	HatGlassesIcon,
	UploadIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import useSWR from "swr";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import Container from "@/components/ui/container";
import { useCurrentOrgId } from "@/lib/current-org";
import { formatBytes } from "@/lib/format-bytes";

interface OrgStats {
	projects: {
		total: number;
		byVisibility: { public: number; private: number };
	};
	members: { total: number };
	destinations: {
		total: number;
		byStatus: { untested: number; ok: number; error: number };
	};
	storage: {
		totalBytes: number;
		byProject: { projectId: string; name: string; bytes: number }[];
	};
	assets: {
		total: number;
		byStatus: {
			pending: number;
			processing: number;
			ready: number;
			failed: number;
		};
		createdOverTime: { date: string; count: number }[];
	};
}

export default function Home() {
	const { user, organizations } = useAuth();
	const orgId = useCurrentOrgId(organizations.map((o) => o.id));
	const org = organizations.find((o) => o.id === orgId);

	const hasNoOrg = organizations.length === 0;
	// Root has implicit access to every org regardless of membership rows
	// (see ARCHITECTURE.md's Authorization Model section) — a root with zero
	// membership rows still has somewhere useful to go: Instance >
	// Organizations, the one real place organizations get created and
	// managed (see that page's "New organization" dialog) — not a duplicate
	// input right here. This is also what a fresh instance's root — or any
	// root after the only org gets deleted — lands on now, instead of being
	// bounced through the onboarding wizard again (see
	// proxy.ts/onboarding.ts: onboarding only ever needs to happen once).
	//
	// org_creator is in the same boat as root here: its one instance-wide
	// permission (instance:manage_orgs) is exactly what /instance/organizations
	// needs, and proxy.ts carves that page out for org_creator specifically —
	// so a stranded org_creator gets routed there too, instead of the
	// "ask an administrator" dead end a plain member/no-role account gets.
	const isOrgCreator = user.instanceRole === "org_creator";
	const canManageOrgs = hasNoOrg && (user.instanceRole === "root" || isOrgCreator);
	const isStranded = hasNoOrg && user.instanceRole !== "root" && !isOrgCreator;

	const { data: stats } = useSWR<OrgStats>(orgId ? `/organizations/${orgId}/stats` : null);

	if (hasNoOrg) {
		return (
			<Container
				className="h-full"
				size="md"
				container={{
					className: "flex items-center justify-center flex-1 gap-y-2 text-center",
				}}
			>
				<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
					<Building2Icon className="size-7 text-muted-foreground" />
				</div>
				<div className="flex max-w-sm flex-col gap-1.5">
					<h2 className="text-lg font-semibold">No organizations yet</h2>
					<div className="text-sm text-muted-foreground w-full">
						{canManageOrgs &&
							[
								`This instance doesn't have an organization.`,
								`Create one from Instance settings to get started.`,
							].map((i) => <p key={i}>{i}</p>)}
						{isStranded &&
							[
								`${user.name}, your account isn't part of any organization on this instance.`,
								`Ask an instance administrator to add you to one — there's nothing else to do here until then.`,
							].map((i) => <p key={i}>{i}</p>)}
					</div>
				</div>
				{canManageOrgs && (
					<Link href="/instance/organizations" className={buttonVariants({ variant: "default" })}>
						Go to Organizations
					</Link>
				)}
			</Container>
		);
	}

	if (!org) return null;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
			<div>
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<p className="text-sm text-muted-foreground">
					{org.name} — <span className="capitalize">{org.role}</span>
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard icon={FolderIcon} label="Projects" value={stats?.projects.total} />
				<StatCard icon={UsersIcon} label="Members" value={stats?.members.total} />
				<StatCard icon={DatabaseIcon} label="S3 Destinations" value={stats?.destinations.total} />
				<StatCard
					icon={HardDriveIcon}
					label="Storage used"
					value={stats ? formatBytes(stats.storage.totalBytes) : undefined}
				/>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<ProjectsByVisibilityChart stats={stats} />
				<StorageByProjectChart stats={stats} />
				<DestinationHealthChart stats={stats} />
				<AssetsOverTimeChart stats={stats} />
			</div>
		</div>
	);
}

function StatCard({
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

function ChartEmptyState({ message }: { message: string }) {
	return (
		<div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
			{message}
		</div>
	);
}

const VISIBILITY_CONFIG: ChartConfig = {
	public: { label: "Public", color: "var(--chart-1)" },
	private: { label: "Private", color: "var(--chart-2)" },
};

function ProjectsByVisibilityChart({ stats }: { stats: OrgStats | undefined }) {
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
					<ChartEmptyState message="Loading…" />
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

const STORAGE_CONFIG: ChartConfig = {
	bytes: { label: "Storage", color: "var(--chart-3)" },
};

function StorageByProjectChart({ stats }: { stats: OrgStats | undefined }) {
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
					<ChartEmptyState message="Loading…" />
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

const DESTINATION_CONFIG: ChartConfig = {
	ok: { label: "OK", color: "var(--chart-1)" },
	untested: { label: "Untested", color: "var(--chart-4)" },
	error: { label: "Error", color: "var(--destructive)" },
};

function DestinationHealthChart({ stats }: { stats: OrgStats | undefined }) {
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
					<ChartEmptyState message="Loading…" />
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

const ASSETS_CONFIG: ChartConfig = {
	count: { label: "Assets uploaded", color: "var(--chart-2)" },
};

function AssetsOverTimeChart({ stats }: { stats: OrgStats | undefined }) {
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
					<ChartEmptyState message="Loading…" />
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

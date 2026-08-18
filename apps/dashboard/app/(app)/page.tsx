"use client";

// Reads currentOrgId (sessionStorage) at runtime and fetches org-scoped
// stats — same reasoning as the other org-scoped pages, see their
// `dynamic = "force-dynamic"` comments.
export const dynamic = "force-dynamic";

import { Building2Icon, DatabaseIcon, FolderIcon, HardDriveIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { useCurrentOrgId } from "@/lib/current-org";
import { formatBytes } from "@/lib/format-bytes";
import { AssetsOverTimeChart } from "./components/assets-over-time-chart";
import { DestinationHealthChart } from "./components/destination-health-chart";
import { ProjectsByVisibilityChart } from "./components/projects-by-visibility-chart";
import { StatCard } from "./components/stat-card";
import { StorageByProjectChart } from "./components/storage-by-project-chart";
import type { OrgStats } from "./components/types";

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

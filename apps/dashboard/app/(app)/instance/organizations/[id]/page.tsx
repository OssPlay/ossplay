"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ArrowLeftIcon, Building2Icon, FolderIcon, SettingsIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { ApiError } from "@/lib/api";
import { setCurrentOrgId } from "@/lib/current-org";
import { formatDatetime } from "@/lib/utils";

interface OrganizationDetail {
	id: string;
	name: string;
	createdAt: string;
}
interface Member {
	userId: string;
}
interface Project {
	id: string;
}

// A summary, not a second copy of Members/Projects — root manages an
// organization through its own real settings pages (organization/*), same
// as its owners would, just reached from here. See that section's
// Members/Projects pages for the actual tables.
export default function InstanceOrganizationDetailPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const { data: orgData, error: orgError } = useSWR<{ organization: OrganizationDetail }>(
		`/organizations/${params.id}`,
	);
	const { data: membersData } = useSWR<{ members: Member[] }>(
		`/organizations/${params.id}/members`,
	);
	const { data: projectsData } = useSWR<{ projects: Project[] }>(
		`/organizations/${params.id}/projects`,
	);

	const notFound = orgError instanceof ApiError && orgError.status === 404;

	if (notFound) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}
	if (!orgData) return null;

	const { organization } = orgData;

	// Switches the app's "current org" to this one before navigating into its
	// real settings pages — those resolve which org they're managing from
	// that same shared context every org-scoped page uses (see
	// current-org.ts). Root reaches any org this way even without a
	// membership row there (organization/layout.tsx's `allowAny`).
	function manage(href: string) {
		setCurrentOrgId(organization.id);
		router.push(href);
	}

	return (
		<Section
			breadcrumb={[
				{ title: organization.name, href: `/instance/organizations/${organization.id}` },
			]}
		>
			<Container
				header={{
					icon: Building2Icon,
					title: organization.name,
					description: `Created ${formatDatetime(organization.createdAt)}`,
				}}
			>
				<div className="flex flex-col gap-6">
					<Link
						href="/instance/organizations"
						className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
					>
						<ArrowLeftIcon className="size-4" /> Back to Organizations
					</Link>

					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{membersData ? membersData.members.length : "…"} member
							{membersData?.members.length === 1 ? "" : "s"}
						</Badge>
						<Badge variant="secondary">
							{projectsData ? projectsData.projects.length : "…"} project
							{projectsData?.projects.length === 1 ? "" : "s"}
						</Badge>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button variant="secondary" onClick={() => manage("/organization")}>
							<SettingsIcon /> Organization settings
						</Button>
						<Button variant="secondary" onClick={() => manage("/organization/members")}>
							<UsersIcon /> Members
						</Button>
						<Button variant="secondary" onClick={() => manage("/organization/projects")}>
							<FolderIcon /> Projects
						</Button>
					</div>
				</div>
			</Container>
		</Section>
	);
}

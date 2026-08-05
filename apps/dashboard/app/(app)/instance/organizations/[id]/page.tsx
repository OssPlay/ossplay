"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ArrowLeftIcon, Building2Icon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Container from "@/components/ui/container";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatDatetime } from "@/lib/utils";

interface OrganizationDetail {
	id: string;
	name: string;
	createdAt: string;
}
interface Member {
	userId: string;
	name: string;
	email: string;
	role: string;
	lastSignInAt: string | null;
	joinedAt: string;
}
interface Project {
	id: string;
	name: string;
	createdAt: string;
}

export default function InstanceOrganizationDetailPage() {
	const params = useParams<{ id: string }>();
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
	const members = membersData?.members ?? [];
	const projects = projectsData?.projects ?? [];

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

					<Card>
						<CardHeader>
							<CardTitle>Members</CardTitle>
						</CardHeader>
						<CardContent>
							{members.length === 0 ? (
								<p className="text-sm text-muted-foreground">No members yet.</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Last sign-in</TableHead>
											<TableHead>Joined</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => (
											<TableRow key={member.userId}>
												<TableCell>
													{member.name}{" "}
													<span className="text-muted-foreground">{member.email}</span>
												</TableCell>
												<TableCell>
													<Badge variant="secondary">{member.role}</Badge>
												</TableCell>
												<TableCell className="text-muted-foreground">
													{member.lastSignInAt ? formatDatetime(member.lastSignInAt) : "Never"}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatDatetime(member.joinedAt)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Projects</CardTitle>
						</CardHeader>
						<CardContent>
							{projects.length === 0 ? (
								<p className="text-sm text-muted-foreground">No projects yet.</p>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Created</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{projects.map((project) => (
											<TableRow key={project.id}>
												<TableCell className="font-medium">{project.name}</TableCell>
												<TableCell className="text-muted-foreground">
													{formatDatetime(project.createdAt)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</div>
			</Container>
		</Section>
	);
}

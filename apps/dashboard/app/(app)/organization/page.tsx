"use client";

import { Building2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import ApiLoader from "@/components/layout/api-loader";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import Container from "@/components/ui/container";
import { OrganizationName } from "./components/organization-name";
import { useResolvedOrg } from "./hooks/use-resolved-org";

// General info only — deleting the organization lives at its own /delete
// route, linked from the Danger zone card below, not inline on this page.
export default function OrganizationGeneralPage() {
	const { user } = useAuth();
	const { org, isLoading, notFound, mutate } = useResolvedOrg();
	const canDelete = org && (org.role === "owner" || user.instanceRole === "root");

	if (notFound) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	return (
		<ApiLoader isLoading={isLoading} skeleton={<ContainerSkeleton size="sm" rows={2} />}>
			{org && (
				<div className="flex flex-col gap-6">
					<Container
						header={{
							icon: Building2Icon,
							title: "Organization",
							description: "This organization's name and your role within it.",
						}}
						size="sm"
					>
						<OrganizationName org={org} onSaved={() => mutate()} />
					</Container>
					{canDelete && (
						<Container
							header={{
								icon: TriangleAlertIcon,
								title: "Danger zone",
								description: "Permanently remove this organization and everything in it.",
							}}
							size="sm"
						>
							<Link
								href="/organization/delete"
								className={buttonVariants({ variant: "secondary" })}
							>
								Delete organization
							</Link>
						</Container>
					)}
				</div>
			)}
		</ApiLoader>
	);
}

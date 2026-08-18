"use client";

import { Building2Icon } from "lucide-react";
import ApiLoader from "@/components/layout/api-loader";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import { OrganizationName } from "./components/organization-name";
import { useResolvedOrg } from "./hooks/use-resolved-org";

// General info only — deleting the organization is a separate, independently
// loading/erroring @danger slot (see layout.tsx), the same split members/
// projects/destinations already got as their own routes.
export default function OrganizationGeneralPage() {
	const { org, isLoading, notFound, mutate } = useResolvedOrg();

	if (notFound) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	return (
		<ApiLoader isLoading={isLoading} skeleton={<ContainerSkeleton size="sm" rows={2} />}>
			{org && (
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
			)}
		</ApiLoader>
	);
}

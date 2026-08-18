"use client";

import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import { OrganizationsCard } from "../components/organizations-card";
import { useUserDetail } from "../hooks/use-user-detail";

export default function MembershipsSlot() {
	const { data, isLoading, forbidden, notFound, mutate } = useUserDetail();

	if (isLoading) return <ContainerSkeleton rows={2} />;
	if (forbidden || notFound || !data) return null;

	return (
		<Container header={{ title: "Organizations" }}>
			<OrganizationsCard
				userId={data.user.id}
				organizations={data.organizations}
				onChange={() => mutate()}
			/>
		</Container>
	);
}

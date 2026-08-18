"use client";

import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import { SecurityActions } from "../components/security-actions";
import { useUserDetail } from "../hooks/use-user-detail";

export default function SecuritySlot() {
	const { data, isLoading, forbidden, notFound, mutate } = useUserDetail();

	if (isLoading) return <ContainerSkeleton size="lg" rows={2} />;
	if (forbidden || notFound || !data) return null;

	return (
		<Container header={{ title: "Security" }} size="lg">
			<SecurityActions user={data.user} onChange={() => mutate()} />
		</Container>
	);
}

"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import Container from "@/components/ui/container";
import { DangerZone } from "../components/danger-zone";
import { useUserDetail } from "../hooks/use-user-detail";

export default function DangerSlot() {
	const router = useRouter();
	const { data, isLoading, forbidden, notFound } = useUserDetail();

	if (isLoading) return <ContainerSkeleton size="lg" rows={1} />;
	if (forbidden || notFound || !data) return null;

	return (
		<Container
			header={{
				icon: TriangleAlertIcon,
				title: "Delete user",
				description: "Permanently removes the account and every organization membership it has.",
			}}
			size="lg"
			variant="destructive"
		>
			<DangerZone user={data.user} onDeleted={() => router.replace("/instance/users")} />
		</Container>
	);
}

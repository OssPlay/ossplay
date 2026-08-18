"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import Container from "@/components/ui/container";
import { DeleteOrganization } from "../components/delete-organization";
import { useResolvedOrg } from "../hooks/use-resolved-org";

export default function OrganizationDangerSlot() {
	const router = useRouter();
	const { user } = useAuth();
	const { org, isLoading, notFound, mutate } = useResolvedOrg();

	if (isLoading || notFound || !org) return null;
	if (org.role !== "owner" && user.instanceRole !== "root") return null;

	return (
		<Container
			header={{
				icon: TriangleAlertIcon,
				title: "Delete organization",
				description: "Permanently remove this organization and everything in it.",
			}}
			size="sm"
		>
			<DeleteOrganization
				org={org}
				onDeleted={() => {
					mutate();
					// Root managing an org via instance/organizations has
					// somewhere to go back to (the org list) — everyone else
					// (a genuine owner leaving their own org) lands on "/",
					// which already knows how to show the right zero-org state.
					router.replace(user.instanceRole === "root" ? "/instance/organizations" : "/");
				}}
			/>
		</Container>
	);
}

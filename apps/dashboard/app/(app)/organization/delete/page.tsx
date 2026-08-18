"use client";

import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import Container from "@/components/ui/container";
import { DeleteOrganization } from "../components/delete-organization";
import { useResolvedOrg } from "../hooks/use-resolved-org";

export default function OrganizationDeletePage() {
	const router = useRouter();
	const { user } = useAuth();
	const { org, isLoading, notFound, mutate } = useResolvedOrg();

	if (isLoading) return <ContainerSkeleton size="sm" rows={2} />;
	if (notFound || !org) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}
	if (org.role !== "owner" && user.instanceRole !== "root") {
		return <p className="text-sm text-muted-foreground">You don't have permission to do this.</p>;
	}

	return (
		<Container
			header={{
				icon: TriangleAlertIcon,
				title: "Delete organization",
				description: "Permanently remove this organization and everything in it.",
			}}
			size="sm"
		>
			<div className="flex flex-col gap-4">
				<Link
					href="/organization"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
				>
					<ArrowLeftIcon className="size-4" /> Back to Organization
				</Link>
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
			</div>
		</Container>
	);
}

"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { ArrowLeftIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import ContainerSkeleton from "@/components/layout/container-skeleton";
import { InstanceForbidden } from "@/components/layout/instance-forbidden";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/ui/container";
import { useUserDetail } from "./hooks/use-user-detail";

// The primary/default content for this route — identity header (name,
// email, badges) plus a back link. Security actions, org memberships, and
// account deletion are separate, independently-loading @security/
// @memberships/@danger slots (see layout.tsx) rather than crammed into one
// 483-line file the way this page used to be.
export default function InstanceUserDetailPage() {
	const { instance } = useAuth();
	const { data, isLoading, forbidden, notFound } = useUserDetail();

	if (isLoading) return <ContainerSkeleton size="lg" rows={2} />;
	if (forbidden) return <InstanceForbidden />;
	if (notFound) {
		return <p className="text-sm text-muted-foreground">User not found.</p>;
	}
	if (!data) return null;

	const { user } = data;

	return (
		<Container
			header={{
				icon: UserIcon,
				title: user.name,
				description: user.email,
				learnMore: instance?.docsUrl
					? { href: `${instance.docsUrl}/guides/instance-users` }
					: undefined,
			}}
			size="lg"
		>
			<div className="flex flex-col gap-4">
				<Link
					href="/instance/users"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
				>
					<ArrowLeftIcon className="size-4" /> Back to Users
				</Link>

				<div className="flex flex-wrap items-center gap-2">
					{user.instanceRole && (
						<Badge variant="default">{user.instanceRole === "root" ? "root" : "org creator"}</Badge>
					)}
					{user.disabledAt ? (
						<Badge variant="destructive">Blocked</Badge>
					) : (
						<Badge variant="success">Active</Badge>
					)}
					<span className="text-sm text-muted-foreground">
						{user.totpEnabled ? "2FA enabled" : "No 2FA"} · {user.passkeyCount} passkey
						{user.passkeyCount === 1 ? "" : "s"}
					</span>
					<span className="text-sm text-muted-foreground">
						Last sign-in:{" "}
						{user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never"}
					</span>
				</div>
			</div>
		</Container>
	);
}

"use client";

import { Building2Icon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";

export default function Home() {
	const { user, organizations, handleLogout, isLoading } = useAuth();

	const primaryOrg = organizations[0];
	const hasNoOrg = organizations.length === 0;
	// Root has implicit access to every org regardless of membership rows
	// (see ARCHITECTURE.md's Authorization Model section) — a root with zero
	// membership rows still has somewhere useful to go: Instance >
	// Organizations, the one real place organizations get created and
	// managed (see that page's "New organization" dialog) — not a duplicate
	// input right here. A non-root account with no membership genuinely has
	// nothing to do until an admin adds them. This is also what a fresh
	// instance's root — or any root after the only org gets deleted — lands
	// on now, instead of being bounced through the onboarding wizard again
	// (see proxy.ts/onboarding.ts: onboarding only ever needs to happen
	// once).
	const isRootStranded = hasNoOrg && user.instanceRole === "root";
	const isStranded = hasNoOrg && user.instanceRole !== "root";

	if (isRootStranded) {
		return (
			<Container size="lg" className="flex-1">
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
						<Building2Icon className="size-7 text-muted-foreground" />
					</div>
					<div className="flex max-w-sm flex-col gap-1.5">
						<h2 className="text-lg font-semibold">No organizations yet</h2>
						<p className="text-sm text-muted-foreground">
							This instance doesn't have an organization. Create one from Instance settings to get
							started.
						</p>
					</div>
					<Link href="/instance/organizations" className={buttonVariants({ variant: "default" })}>
						Go to Organizations
					</Link>
				</div>
			</Container>
		);
	}

	if (isStranded) {
		return (
			<Container>
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>No organization yet</CardTitle>
						<CardDescription>
							{user.name}, your account isn't part of any organization on this instance.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Ask an instance administrator to add you to one — there's nothing else to do here
							until then.
						</p>
						<LoadingButton variant="outline" loading={isLoading} onClick={handleLogout}>
							Log out
						</LoadingButton>
					</CardContent>
				</Card>
			</Container>
		);
	}

	return (
		<Container>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>OSSPlay Dashboard</CardTitle>
					<CardDescription>
						Self-hosted object storage &amp; file management platform.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="text-sm">
						<p>
							Signed in as <span className="font-medium">{user.name}</span> ({user.email})
						</p>
						{primaryOrg && (
							<p className="text-muted-foreground">
								{primaryOrg.name} — {primaryOrg.role}
							</p>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						Infra scaffold — projects and the drive browser land here next.
					</p>
					<Link href="/settings/profile" className={buttonVariants({ variant: "outline" })}>
						Settings
					</Link>
					<LoadingButton variant="outline" loading={isLoading} onClick={handleLogout}>
						Log out
					</LoadingButton>
				</CardContent>
			</Card>
		</Container>
	);
}

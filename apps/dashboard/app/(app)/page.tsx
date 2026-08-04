"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";

export default function Home() {
	const { user, organizations, handleLogout, isLoading } = useAuth();

	const primaryOrg = organizations[0];
	// Root has implicit access to every org regardless of membership rows
	// (see ARCHITECTURE.md's Authorization Model section), so an empty
	// `organizations` array means something different for them than for
	// anyone else — root always has somewhere to go (/instance), a non-root
	// account with no membership genuinely has nothing to do here yet.
	const isStranded = organizations.length === 0 && user.instanceRole !== "root";

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

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

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OnboardingStatus = {
	needsOnboarding: boolean;
	steps: {
		dns: { skippable: boolean; completed: boolean };
		smtp: { skippable: boolean; completed: boolean };
		updates: { skippable: boolean; completed: boolean };
		org: { skippable: boolean; completed: boolean };
	};
};

// `org` stays last and non-skippable: it's the one step that flips
// onboardedAt/needsOnboarding server-side (see the exit effect below), so a
// step placed after it would never be reachable — the exit redirect fires
// the instant org completes.
const STEPS = [
	{ key: "dns", path: "/onboarding/dns", label: "Domain" },
	{ key: "smtp", path: "/onboarding/smtp", label: "Email" },
	{ key: "updates", path: "/onboarding/updates", label: "Updates" },
	{ key: "org", path: "/onboarding/organization", label: "Organization" },
] as const;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const pathname = usePathname();
	const { data: status, mutate } = useSWR<OnboardingStatus>("/onboarding/status");

	// Re-checks on every step navigation so completing a step elsewhere (or
	// the org step itself finishing) is reflected in the indicator — SWR's
	// own key-based caching wouldn't otherwise refetch just because the
	// pathname changed under the same layout instance.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is a deliberate re-run trigger, not read in the body.
	useEffect(() => {
		mutate();
	}, [pathname, mutate]);

	// Already done — nothing left for this wizard to do, send them on.
	useEffect(() => {
		if (status && !status.needsOnboarding && pathname !== "/onboarding/organization") {
			router.replace("/");
		}
	}, [status, pathname, router]);

	if (!status) {
		return (
			<div className="flex flex-1 items-center justify-center bg-card">
				<LoaderCircleIcon className="animate-spin size-8" />
			</div>
		);
	}

	return (
		<div className="flex flex-1 items-center justify-center bg-card">
			<Card className="w-full max-w-md bg-transparent ring-0">
				<CardHeader>
					<CardTitle className="sr-only">Set up your instance</CardTitle>
					<ol className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
						{STEPS.map((step, index) => {
							const isCurrent = pathname === step.path;
							const isCompleted = status.steps[step.key].completed;
							return (
								<li key={step.key} className="flex items-center gap-2">
									{index > 0 && <span className="text-muted-foreground/50">→</span>}
									<span
										className={
											isCurrent
												? "font-medium text-foreground"
												: isCompleted
													? "text-muted-foreground line-through"
													: ""
										}
									>
										{step.label}
									</span>
								</li>
							);
						})}
					</ol>
				</CardHeader>
				<CardContent>{children}</CardContent>
			</Card>
		</div>
	);
}

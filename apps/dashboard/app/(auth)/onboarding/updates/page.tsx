"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ServerUpdates, type UpdatesInfo } from "@/components/instance/server-updates";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";

interface OverviewResponse {
	updates: UpdatesInfo;
}

// Onboarding lives under app/(auth), outside <AuthProvider> (see
// app/(app)/layout.tsx's own comment on why that provider only wraps the
// authenticated app shell) — so this fetches GET /instance directly instead
// of via useAuth(), same requireAuth-only gate, same shape AuthProvider
// itself reads docsUrl from.
interface InstanceInfo {
	docsUrl: string | null;
}

// Purely informational — nothing here blocks continuing, so this is just a
// "Continue" button, not a separate skip affordance (see SmtpForm's step for
// the skippable-with-something-to-fill-in shape this deliberately isn't).
export default function OnboardingUpdatesStep() {
	const router = useRouter();
	const { data: instance } = useSWR<InstanceInfo>("/instance");
	const { data, mutate } = useSWR<OverviewResponse>("/instance/overview");

	return (
		<div className="flex flex-col gap-4">
			<CardDescription>
				This instance can check for new releases and apply them from here.
				{instance?.docsUrl && (
					<>
						{" "}
						See the{" "}
						<a
							href={`${instance.docsUrl}/guides/updates`}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2"
						>
							updates guide
						</a>{" "}
						for how that works.
					</>
				)}
			</CardDescription>
			{data && <ServerUpdates data={data} mutate={mutate} />}
			<Button onClick={() => router.push("/onboarding/organization")}>Continue</Button>
		</div>
	);
}

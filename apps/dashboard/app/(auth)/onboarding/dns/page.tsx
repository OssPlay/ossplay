"use client";

import { useRouter } from "next/navigation";
import { DomainForm } from "@/components/instance/domain-form";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";

export default function OnboardingDnsStep() {
	const router = useRouter();

	return (
		<div className="flex flex-col gap-4">
			<CardDescription>
				Point a domain at this server for automatic HTTPS. Skippable — you can set this later from
				instance settings.
			</CardDescription>
			<DomainForm
				saveLabel="Continue"
				onSaved={() => router.push("/onboarding/smtp")}
				showInstanceName={false}
			/>
			<Button variant="ghost" onClick={() => router.push("/onboarding/smtp")}>
				Skip
			</Button>
		</div>
	);
}

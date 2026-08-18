"use client";

import { useRouter } from "next/navigation";
import { SmtpForm } from "@/components/instance/smtp-form";
import { Button } from "@/components/ui/button";
import { CardDescription } from "@/components/ui/card";

export default function OnboardingSmtpStep() {
	const router = useRouter();

	return (
		<div className="flex flex-col gap-4">
			<CardDescription>
				Configure SMTP to send invitations and password-reset emails. Skippable — you can set this
				later from instance settings.
			</CardDescription>
			<SmtpForm saveLabel="Continue" onSaved={() => router.push("/onboarding/updates")} />
			<Button variant="ghost" onClick={() => router.push("/onboarding/updates")}>
				Skip
			</Button>
		</div>
	);
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

type OnboardingStatus = {
	needsOnboarding: boolean;
	steps: {
		dns: { completed: boolean };
		smtp: { completed: boolean };
		org: { completed: boolean };
	};
};

// Index route — just picks the first incomplete step and redirects there.
export default function OnboardingIndexPage() {
	const router = useRouter();
	const { data } = useSWR<OnboardingStatus>("/onboarding/status");

	useEffect(() => {
		if (!data) return;
		if (!data.steps.dns.completed) router.replace("/onboarding/dns");
		else if (!data.steps.smtp.completed) router.replace("/onboarding/smtp");
		else router.replace("/onboarding/organization");
	}, [data, router]);

	return null;
}

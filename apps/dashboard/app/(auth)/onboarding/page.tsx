'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api';

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

  useEffect(() => {
    apiFetch<OnboardingStatus>('/onboarding/status').then((res) => {
      if (!res.steps.dns.completed) router.replace('/onboarding/dns');
      else if (!res.steps.smtp.completed) router.replace('/onboarding/smtp');
      else router.replace('/onboarding/organization');
    });
  }, [router]);

  return null;
}

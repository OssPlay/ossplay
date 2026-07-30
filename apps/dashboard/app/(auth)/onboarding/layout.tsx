'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

type OnboardingStatus = {
  needsOnboarding: boolean;
  steps: {
    dns: { skippable: boolean; completed: boolean };
    smtp: { skippable: boolean; completed: boolean };
    org: { skippable: boolean; completed: boolean };
  };
};

const STEPS = [
  { key: 'dns', path: '/onboarding/dns', label: 'Domain' },
  { key: 'smtp', path: '/onboarding/smtp', label: 'Email' },
  { key: 'org', path: '/onboarding/organization', label: 'Organization' },
] as const;

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    apiFetch<OnboardingStatus>('/onboarding/status').then((res) => {
      // Already done — nothing left for this wizard to do, send them on.
      if (!res.needsOnboarding && pathname !== '/onboarding/organization') {
        router.replace('/');
        return;
      }
      setStatus(res);
    });
    // Re-checks on every step navigation so completing a step elsewhere
    // (or the org step itself finishing) is reflected in the indicator.
    // `router` is a stable reference from next/navigation, so this doesn't
    // re-run on every render.
  }, [pathname, router]);

  if (!status) return null;

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
                        ? 'font-medium text-foreground'
                        : isCompleted
                          ? 'text-muted-foreground line-through'
                          : ''
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

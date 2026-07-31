'use client';

import useSWR from 'swr';
import { DomainForm } from '@/components/instance/domain-form';
import { SmtpForm } from '@/components/instance/smtp-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';

export default function InstanceSettingsPage() {
  // SmtpForm/DomainForm each read the same '/instance/settings' key —
  // SWR dedupes all three into one request, so this just probes once up
  // front so a non-root visitor sees a single clear message instead of
  // two independently-403ing cards.
  const { error } = useSWR('/instance/settings');
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Domain</CardTitle>
          <CardDescription>Point a domain at this server for automatic HTTPS.</CardDescription>
        </CardHeader>
        <CardContent>
          <DomainForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMTP</CardTitle>
          <CardDescription>Used to send invitation and password-reset emails.</CardDescription>
        </CardHeader>
        <CardContent>
          <SmtpForm />
        </CardContent>
      </Card>
    </div>
  );
}

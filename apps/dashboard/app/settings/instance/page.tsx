'use client';

import { useEffect, useState } from 'react';
import { DomainForm } from '@/components/instance/domain-form';
import { SmtpForm } from '@/components/instance/smtp-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

export default function InstanceSettingsPage() {
  const [forbidden, setForbidden] = useState(false);

  // SmtpForm/DomainForm each fetch their own data — this just probes once
  // up front so a non-root visitor sees a single clear message instead of
  // two independently-403ing cards.
  useEffect(() => {
    apiFetch('/instance/settings').catch((err) => {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
    });
  }, []);

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

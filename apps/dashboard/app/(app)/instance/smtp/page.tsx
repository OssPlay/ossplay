'use client';

import { SmtpForm } from '@/components/instance/smtp-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InstanceSmtpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>SMTP</CardTitle>
        <CardDescription>Used to send invitation and password-reset emails.</CardDescription>
      </CardHeader>
      <CardContent>
        <SmtpForm />
      </CardContent>
    </Card>
  );
}

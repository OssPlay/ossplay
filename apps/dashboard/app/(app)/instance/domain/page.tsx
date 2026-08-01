'use client';

import { DomainForm } from '@/components/instance/domain-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InstanceDomainPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domain</CardTitle>
        <CardDescription>Point a domain at this server for automatic HTTPS.</CardDescription>
      </CardHeader>
      <CardContent>
        <DomainForm />
      </CardContent>
    </Card>
  );
}

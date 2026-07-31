'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentOrgId } from '@/lib/current-org';

type Me = { organizations: Array<{ orgId: string; orgName: string; role: string }> };

export default function OrganizationGeneralPage() {
  const { data: me } = useSWR<Me>('/auth/me');
  const orgId = useCurrentOrgId(me?.organizations.map((o) => o.orgId));
  const org = me?.organizations.find((o) => o.orgId === orgId);

  if (!org) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{org.orgName}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Your role: {org.role}</CardContent>
    </Card>
  );
}

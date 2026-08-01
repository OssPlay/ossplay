'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentOrgId } from '@/lib/current-org';

export default function OrganizationGeneralPage() {
  const { organizations } = useAuth();
  const orgId = useCurrentOrgId(organizations.map((o) => o.id));
  const org = organizations.find((o) => o.id === orgId);

  if (!org) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{org.name}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Your role: {org.role}</CardContent>
    </Card>
  );
}

'use client';

import { ArrowLeftIcon, Building2Icon, UsersIcon } from 'lucide-react';
import useSWR from 'swr';
import { Section } from '@/components/layout/section';
import { useCurrentOrgId } from '@/lib/current-org';
import type { Sidepanel } from '@/lib/nav-types';

type Me = { organizations: Array<{ orgId: string; orgName: string; role: string }> };

const sidepanel: Sidepanel = [
  { title: 'Back to Dashboard', href: '/', icon: ArrowLeftIcon },
  { title: 'General', href: '/organization/settings', icon: Building2Icon },
  { title: 'Members', href: '/organization/settings/members', icon: UsersIcon },
];

export default function OrganizationSettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useSWR<Me>('/auth/me');
  const orgId = useCurrentOrgId(me?.organizations.map((o) => o.orgId));
  const access = me ? me.organizations.some((o) => o.orgId === orgId) : undefined;

  return (
    <Section sidepanel={sidepanel} breadcrumb={{ title: 'Organization' }} access={access}>
      {children}
    </Section>
  );
}

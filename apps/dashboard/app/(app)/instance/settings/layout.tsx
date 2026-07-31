'use client';

import { ArrowLeftIcon, MailIcon, UsersIcon } from 'lucide-react';
import useSWR from 'swr';
import { Section } from '@/components/layout/section';
import type { Sidepanel } from '@/lib/nav-types';

type Me = { user: { instanceRole: string | null } };

const sidepanel: Sidepanel = [
  { title: 'Back to Dashboard', href: '/', icon: ArrowLeftIcon },
  { title: 'Domain & SMTP', href: '/instance/settings', icon: MailIcon },
  { title: 'Users', href: '/instance/settings/users', icon: UsersIcon },
];

export default function InstanceSettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useSWR<Me>('/auth/me');
  const access = me ? me.user.instanceRole === 'root' : undefined;

  return (
    <Section sidepanel={sidepanel} breadcrumb={{ title: 'Instance' }} access={access}>
      {children}
    </Section>
  );
}

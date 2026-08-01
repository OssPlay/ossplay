'use client';

import { ArrowLeftIcon, MailIcon, WifiCogIcon } from 'lucide-react';
import { Section } from '@/components/layout/section';
import { useAuth } from '@/components/providers/auth-provider';
import type { Sidepanel } from '@/lib/nav-types';

const sidepanel: Sidepanel = [
  { title: 'Back to Dashboard', href: '/', icon: ArrowLeftIcon },
  // { title: 'Domain & SMTP', href: '/instance/settings', icon: MailIcon },
  // { title: 'Users', href: '/instance/settings/users', icon: UsersIcon },
  {
    title: 'Connections',
    icon: WifiCogIcon,
    items: [
      {
        title: 'Email & SMTP',
        icon: MailIcon,
        href: '/instance/smtp',
      },
    ],
  },
];

export default function InstanceSettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const access = user.instanceRole === 'root';

  return (
    <Section sidepanel={sidepanel} breadcrumb={{ title: 'Instance' }} access={access}>
      {children}
    </Section>
  );
}

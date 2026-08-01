'use client';

import {
  ArrowLeftIcon,
  GlobeIcon,
  HardDriveIcon,
  KeyRoundIcon,
  MailIcon,
  ScrollTextIcon,
  ServerCogIcon,
  ServerIcon,
  UsersIcon,
  WifiCogIcon,
} from 'lucide-react';
import { Section } from '@/components/layout/section';
import { useAuth } from '@/components/providers/auth-provider';
import type { Sidepanel } from '@/lib/nav-types';

const sidepanel: Sidepanel = [
  { title: 'Back to Dashboard', href: '/', icon: ArrowLeftIcon },
  { title: 'Web Server', href: '/instance', icon: ServerIcon },
  { title: 'Domain', href: '/instance/domain', icon: GlobeIcon },
  {
    title: 'Connections',
    icon: WifiCogIcon,
    items: [{ title: 'Email & SMTP', href: '/instance/smtp', icon: MailIcon }],
  },
  {
    title: 'Infrastructure',
    icon: ServerCogIcon,
    items: [
      { title: 'Remote Servers', href: '/instance/servers', icon: HardDriveIcon },
      { title: 'SSH Keys', href: '/instance/ssh-keys', icon: KeyRoundIcon },
    ],
  },
  { title: 'Users', href: '/instance/users', icon: UsersIcon },
  { title: 'Audit Logs', href: '/instance/audit-logs', icon: ScrollTextIcon },
];

// The single root-only gate for the whole /instance/* tree — replaces what
// used to be two byte-identical layouts (one at this path, one nested under
// a since-removed /instance/settings) left over from an earlier, unfinished
// move. Every page below inherits this Section's access check.
export default function InstanceLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const access = user.instanceRole === 'root';

  return (
    <Section sidepanel={sidepanel} breadcrumb={{ title: 'Instance' }} access={access}>
      {children}
    </Section>
  );
}

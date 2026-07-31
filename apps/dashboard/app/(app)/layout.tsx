'use client';

import { HomeIcon, SettingsIcon, UsersIcon } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { Section } from '@/components/layout/section';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { Sidepanel } from '@/lib/nav-types';

const sidepanel: Sidepanel = [
  { title: 'Overview', href: '/', icon: HomeIcon },
  {
    title: 'Organization',
    items: [
      { title: 'Members', href: '/organization/settings/members', icon: UsersIcon },
      { title: 'Organization settings', href: '/organization/settings', icon: SettingsIcon },
    ],
  },
];

export default function Layout({ children }: React.PropsWithChildren) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '19rem',
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col p-4">
          <Section sidepanel={sidepanel}>{children}</Section>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountDropdown } from '@/components/layout/account-dropdown';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useSidepanel } from '@/lib/nav-store';
import type { Sidepanel, SidepanelGroup, SidepanelItem } from '@/lib/nav-types';

function isGroup(entry: SidepanelItem | SidepanelGroup): entry is SidepanelGroup {
  return 'items' in entry;
}

function isActivePath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function SidepanelLink({ item }: { item: SidepanelItem }) {
  const pathname = usePathname();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActivePath(pathname, item.href)}
        render={<Link href={item.href} target={item.target} />}
      >
        <item.icon />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// Consecutive bare SidepanelItems share one labelless SidebarGroup; each
// SidepanelGroup gets its own labeled one — keeps ungrouped entries (e.g.
// "Back to Dashboard") from each getting their own group's worth of padding.
type Chunk = { kind: 'items'; items: SidepanelItem[] } | { kind: 'group'; group: SidepanelGroup };

function toChunks(sidepanel: Sidepanel): Chunk[] {
  const chunks: Chunk[] = [];
  for (const entry of sidepanel) {
    if (isGroup(entry)) {
      chunks.push({ kind: 'group', group: entry });
      continue;
    }
    const last = chunks[chunks.length - 1];
    if (last?.kind === 'items') {
      last.items.push(entry);
    } else {
      chunks.push({ kind: 'items', items: [entry] });
    }
  }
  return chunks;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const sidepanel = useSidepanel();

  return (
    <Sidebar variant="floating" {...props}>
      <ProjectSwitcher />
      <SidebarContent>
        {toChunks(sidepanel ?? []).map((chunk, index) =>
          chunk.kind === 'group' ? (
            <SidebarGroup key={`group-${chunk.group.title}`}>
              <SidebarGroupLabel>{chunk.group.title}</SidebarGroupLabel>
              <SidebarMenu>
                {chunk.group.items.map((item) => (
                  <SidepanelLink key={item.href} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: chunks are derived fresh from sidepanel every render, in stable order — there's no identity to key by other than position.
            <SidebarGroup key={`items-${index}`}>
              <SidebarMenu>
                {chunk.items.map((item) => (
                  <SidepanelLink key={item.href} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ),
        )}
      </SidebarContent>
      <AccountDropdown />
    </Sidebar>
  );
}

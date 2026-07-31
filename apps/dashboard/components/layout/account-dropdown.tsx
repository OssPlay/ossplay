'use client';

import { BookOpenIcon, LogOutIcon, SettingsIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useLogout } from '@/hooks/use-logout';
import packageJson from '../../package.json';

type Me = { user: { name: string; email: string } };

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function AccountDropdown() {
  const { data: me } = useSWR<Me>('/auth/me');
  const { handleLogout, isLoading } = useLogout();

  if (!me) return null;

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{initials(me.user.name)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden leading-none">
                <span className="truncate font-medium">{me.user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{me.user.email}</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="font-medium text-foreground">{me.user.name}</p>
                  <p>{me.user.email}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/settings/profile" />}>
                <UserIcon /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/security" />}>
                <SettingsIcon /> Settings
              </DropdownMenuItem>
              {DOCS_URL && (
                <DropdownMenuItem render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}>
                  <BookOpenIcon /> Documentation
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={isLoading} onClick={handleLogout}>
                <LogOutIcon /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <p className="px-2 pb-1 text-center text-xs text-muted-foreground">v{packageJson.version}</p>
    </SidebarFooter>
  );
}

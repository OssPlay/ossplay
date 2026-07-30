'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Me = { user: { instanceRole: string | null } };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isRoot, setIsRoot] = useState(false);

  useEffect(() => {
    apiFetch<Me>('/auth/me')
      .then((me) => setIsRoot(me.user.instanceRole === 'root'))
      .catch(() => {});
  }, []);

  const tabs = [
    { href: '/settings/account', label: 'Account' },
    { href: '/settings/organization', label: 'Organization' },
    ...(isRoot
      ? [
          { href: '/settings/instance', label: 'Instance' },
          { href: '/settings/instance/users', label: 'Users' },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to dashboard
        </Link>
      </div>
      <nav className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              pathname === tab.href
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

type Me = {
  user: { id: string; email: string; name: string; instanceRole: string | null };
  organizations: Array<{ orgId: string; orgName: string; role: string }>;
};

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    apiFetch<Me>('/auth/me')
      .then(setMe)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
        }
      });
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  if (!me) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const primaryOrg = me.organizations[0];

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>OSSPlay Dashboard</CardTitle>
          <CardDescription>
            Self-hosted object storage &amp; file management platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-sm">
            <p>
              Signed in as <span className="font-medium">{me.user.name}</span> ({me.user.email})
            </p>
            {primaryOrg && (
              <p className="text-muted-foreground">
                {primaryOrg.orgName} — {primaryOrg.role}
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Infra scaffold — projects and the drive browser land here next.
          </p>
          <Button variant="outline" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

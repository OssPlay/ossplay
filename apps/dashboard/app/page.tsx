'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import useSWR from 'swr';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { useActiveActionCount } from '@/lib/action-store';
import { apiFetch } from '@/lib/api';

type Me = {
  user: { id: string; email: string; name: string; instanceRole: string | null };
  organizations: Array<{ orgId: string; orgName: string; role: string }>;
};

export default function Home() {
  const router = useRouter();
  const { data: me } = useSWR<Me>('/auth/me');
  const activeActionCount = useActiveActionCount();
  const logout = useAction(() => apiFetch('/auth/logout', { method: 'POST' }), { error: null });

  async function handleLogoutClick() {
    if (activeActionCount > 0) {
      toast.info('Please wait for the current action to finish.');
      return;
    }
    try {
      await logout.trigger();
    } finally {
      // Always navigate away, even if the server-side logout call failed —
      // clearing local state matters more than a clean server round-trip.
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
          <Link href="/settings/account" className={buttonVariants({ variant: 'outline' })}>
            Settings
          </Link>
          <LoadingButton variant="outline" loading={logout.isLoading} onClick={handleLogoutClick}>
            Log out
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  );
}

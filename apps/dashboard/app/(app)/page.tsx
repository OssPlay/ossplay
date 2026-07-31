'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Container from '@/components/ui/container';
import { LoadingButton } from '@/components/ui/loading-button';
import { useLogout } from '@/hooks/use-logout';

type Me = {
  user: {
    id: string;
    email: string;
    name: string;
    instanceRole: string | null;
  };
  organizations: Array<{ orgId: string; orgName: string; role: string }>;
};

export default function Home() {
  const { data: me } = useSWR<Me>('/auth/me');
  const { handleLogout, isLoading } = useLogout();

  if (!me) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const primaryOrg = me.organizations[0];

  return (
    <Container>
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
          <Link href="/settings/profile" className={buttonVariants({ variant: 'outline' })}>
            Settings
          </Link>
          <LoadingButton variant="outline" loading={isLoading} onClick={handleLogout}>
            Log out
          </LoadingButton>
        </CardContent>
      </Card>
    </Container>
  );
}

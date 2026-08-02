'use client';

import { RefreshCwIcon, ServerIcon } from 'lucide-react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Container from '@/components/ui/container';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { apiFetch } from '@/lib/api';

type OverviewResponse = {
  serverIp: string | null;
  versions: { api: string | null; dashboard: string | null; worker: string | null };
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default function InstanceOverviewPage() {
  const { data } = useSWR<OverviewResponse>('/instance/overview');

  const checkUpdates = useAction(
    () =>
      apiFetch<{ available: boolean; reason: string }>('/instance/updates/check', {
        method: 'POST',
      }),
    { error: 'Could not check for updates' },
  );

  return (
    <Container
      header={{
        icon: ServerIcon,
        title: 'Web Server',
        description: 'Server info and version details for this instance.',
      }}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Server</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <InfoRow
              label="Server IP"
              value={data ? (data.serverIp ?? 'Could not be determined') : '—'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <InfoRow label="Dashboard" value={data?.versions.dashboard ?? '—'} />
            <InfoRow label="API" value={data?.versions.api ?? '—'} />
            <InfoRow label="Worker" value={data?.versions.worker ?? '—'} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Updates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <LoadingButton
            variant="secondary"
            className="w-fit"
            loading={checkUpdates.isLoading}
            onClick={() => checkUpdates.trigger()}
          >
            <RefreshCwIcon /> Check for updates
          </LoadingButton>
          {checkUpdates.data && (
            <p className="text-sm text-muted-foreground">{checkUpdates.data.reason}</p>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}

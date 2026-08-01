'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { apiFetch, errorMessage } from '@/lib/api';

// Shared by /instance/domain and /onboarding/dns — same field, same
// PUT /instance/domain call. Caddy's admin API may not be reachable (local
// dev, or any non-Docker-Compose deployment) — caddyApplied surfaces that
// honestly rather than implying a certificate was issued.
export function DomainForm({
  saveLabel = 'Save',
  onSaved,
}: {
  saveLabel?: string;
  onSaved?: () => void;
}) {
  const { data, mutate } = useSWR<{ domain: string | null; domainConfiguredAt: string | null }>(
    '/instance/domain',
  );
  const [domain, setDomain] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  // Seeds the editable field from the fetched value exactly once — a
  // background SWR revalidation must not stomp on what the user is
  // currently typing.
  const seeded = useRef(false);

  useEffect(() => {
    if (data && !seeded.current) {
      setDomain(data.domain ?? '');
      seeded.current = true;
    }
  }, [data]);

  const save = useAction(
    () =>
      apiFetch<{ domain: string | null; caddyApplied: boolean; message: string }>(
        '/instance/domain',
        { method: 'PUT', body: JSON.stringify({ domain: domain || null }) },
      ),
    { error: 'Could not save domain' },
  );

  async function handleSubmit() {
    setMessage(null);
    await save
      .trigger()
      .then((res) => {
        setMessage(res.message);
        mutate();
        onSaved?.();
      })
      .catch(() => {});
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField
        id="domain"
        label="Domain"
        value={domain}
        onChange={setDomain}
        helpText="e.g. ossplay.example.com — needs to already point at this server."
        disabled={save.isLoading}
      />
      <FormError message={save.error ? errorMessage(save.error, 'Could not save domain') : null} />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <LoadingButton type="button" loading={save.isLoading} onClick={handleSubmit}>
        {saveLabel}
      </LoadingButton>
      {data?.domain && (
        <p className="text-xs text-muted-foreground">Currently configured: {data.domain}</p>
      )}
    </div>
  );
}

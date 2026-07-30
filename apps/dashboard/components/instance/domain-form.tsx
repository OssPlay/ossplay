'use client';

import { useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';

// Shared by /settings/instance and /onboarding/dns — same field, same
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
  const [domain, setDomain] = useState('');
  const [existingDomain, setExistingDomain] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ domain: string | null }>('/instance/settings').then((res) => {
      setExistingDomain(res.domain);
      setDomain(res.domain ?? '');
    });
  }, []);

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ domain: string | null; caddyApplied: boolean; message: string }>(
        '/instance/domain',
        { method: 'PUT', body: JSON.stringify({ domain: domain || null }) },
      );
      setExistingDomain(res.domain);
      setMessage(res.message);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save domain');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField
        id="domain"
        label="Domain"
        value={domain}
        onChange={setDomain}
        helpText="e.g. ossplay.example.com — needs to already point at this server."
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Button type="button" onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Saving…' : saveLabel}
      </Button>
      {existingDomain && (
        <p className="text-xs text-muted-foreground">Currently configured: {existingDomain}</p>
      )}
    </div>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

// Only 'totp' is a real value today (TOTP codes and recovery codes both
// verify at the same endpoint/screen) — this route exists as forward-
// compatible plumbing for future 2FA methods, not because multiple exist
// yet. An unrecognized method still renders the same TOTP/recovery-code
// form rather than a dead end, since that's the only challenge the backend
// actually knows how to verify right now.
export default function TwoFactorMethodPage() {
  const { method } = useParams<{ method: string }>();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
        <CardHeader>
          <CardTitle>Enter your code</CardTitle>
          <CardDescription>
            {method === 'totp'
              ? 'Enter the code from your authenticator app, or a recovery code.'
              : 'Enter your verification code.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <FormField id="code" label="Code" value={code} onChange={setCode} required autoFocus />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" onClick={handleVerify} disabled={submitting || !code}>
              {submitting ? 'Verifying…' : 'Verify'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { browserSupportsWebAuthn, loginWithPasskey } from '@/lib/passkey';

// Reuses the exact same ceremony as the /login passkey button — a
// successful passkey authentication *is* full account recovery, sidestepping
// the password entirely, so there's no separate "passkey recovery" endpoint
// on the API side.
export default function ForgotPasswordPasskeyPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithPasskey();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Passkey recovery failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
        <CardHeader>
          <CardTitle>Recover with a passkey</CardTitle>
          <CardDescription>
            Your browser will prompt you to choose a passkey. Signing in this way logs you straight
            into your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {supported === false && (
            <p className="text-sm text-muted-foreground">
              This browser doesn&apos;t support passkeys.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" onClick={handleClick} disabled={submitting || supported === false}>
            {submitting ? 'Waiting for passkey…' : 'Continue with a passkey'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

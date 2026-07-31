'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { errorMessage } from '@/lib/api';
import { browserSupportsWebAuthn, loginWithPasskey } from '@/lib/passkey';

// Reuses the exact same ceremony as the /login passkey button — a
// successful passkey authentication *is* full account recovery, sidestepping
// the password entirely, so there's no separate "passkey recovery" endpoint
// on the API side.
export default function ForgotPasswordPasskeyPage() {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const recover = useAction(() => loginWithPasskey(), { error: 'Passkey recovery failed' });

  async function handleClick() {
    await recover
      .trigger()
      .then(() => {
        router.push('/');
        router.refresh();
      })
      .catch(() => {});
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
          <FormError
            message={recover.error ? errorMessage(recover.error, 'Passkey recovery failed') : null}
          />
          <LoadingButton
            type="button"
            loading={recover.isLoading}
            loadingText="Waiting for passkey…"
            onClick={handleClick}
            disabled={supported === false}
          >
            Continue with a passkey
          </LoadingButton>
        </CardContent>
      </Card>
    </div>
  );
}

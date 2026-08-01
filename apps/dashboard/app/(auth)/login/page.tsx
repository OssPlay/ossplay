'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { apiFetch, errorMessage } from '@/lib/api';
import { browserSupportsWebAuthn, loginWithPasskey } from '@/lib/passkey';
import { getSafeContinuePath } from '@/lib/safe-redirect';

type LoginResponse =
  | { requiresTwoFactor: true }
  | { user: { id: string; email: string; name: string } };

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const continuePath = getSafeContinuePath(searchParams.get('continue'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Checked after mount, not during render, so the server-rendered HTML
  // (which can't know the browser's WebAuthn support) matches the client's
  // first render and React doesn't flag a hydration mismatch.
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
  }, []);

  const login = useAction(
    () =>
      apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    { error: 'Login failed' },
  );

  // A full first-factor login replacement, not a second factor stacked on
  // password — a successful passkey ceremony is a complete sign-in, no
  // subsequent 2FA step.
  const passkeyLogin = useAction(() => loginWithPasskey(), { error: 'Passkey login failed' });

  // Explicit preventDefault on both the form's submit (Enter key in a text
  // field) and the button's click — belt and suspenders against native form
  // submission ever navigating the page instead of running this handler.
  async function handleLogin(event: SyntheticEvent) {
    event.preventDefault();
    passkeyLogin.reset();
    await login
      .trigger()
      .then((res) => {
        if ('requiresTwoFactor' in res) {
          router.push(
            `/login/2fa/totp${continuePath ? `?continue=${encodeURIComponent(continuePath)}` : ''}`,
          );
          return;
        }
        router.push(continuePath ?? '/');
        router.refresh();
      })
      .catch(() => {});
  }

  async function handlePasskeyLogin() {
    login.reset();
    await passkeyLogin
      .trigger()
      .then(() => {
        router.push(continuePath ?? '/');
        router.refresh();
      })
      .catch(() => {});
  }

  const error = login.error ?? passkeyLogin.error;
  const errorFallback = login.error ? 'Login failed' : 'Passkey login failed';
  const busy = login.isLoading || passkeyLogin.isLoading;

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
        <CardHeader>
          <CardTitle>Log in to OSSPlay</CardTitle>
          <CardDescription>Enter your admin credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <FormField
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="email"
              autoFocus
              disabled={busy}
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="current-password"
              disabled={busy}
            />
            <FormError message={error ? errorMessage(error, errorFallback) : null} />
            <LoadingButton
              type="submit"
              loading={login.isLoading}
              loadingText="Logging in…"
              onClick={handleLogin}
              disabled={passkeyLogin.isLoading}
            >
              Log in
            </LoadingButton>
            {passkeySupported && (
              <LoadingButton
                type="button"
                variant="outline"
                loading={passkeyLogin.isLoading}
                loadingText="Waiting for passkey…"
                onClick={handlePasskeyLogin}
                disabled={login.isLoading}
              >
                Continue with a passkey
              </LoadingButton>
            )}
            <Link
              href="/forgot-password"
              className="text-center text-sm text-muted-foreground underline"
            >
              Forgot password?
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';
import { browserSupportsWebAuthn, loginWithPasskey } from '@/lib/passkey';

type LoginResponse =
  | { requiresTwoFactor: true }
  | { user: { id: string; email: string; name: string } };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  // Checked after mount, not during render, so the server-rendered HTML
  // (which can't know the browser's WebAuthn support) matches the client's
  // first render and React doesn't flag a hydration mismatch.
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
  }, []);

  // Explicit preventDefault on both the form's submit (Enter key in a text
  // field) and the button's click — belt and suspenders against native form
  // submission ever navigating the page instead of running this handler.
  async function handleLogin(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if ('requiresTwoFactor' in res) {
        router.push('/login/2fa/totp');
        return;
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  // A full first-factor login replacement, not a second factor stacked on
  // password — a successful passkey ceremony is a complete sign-in, no
  // subsequent 2FA step.
  async function handlePasskeyLogin() {
    setError(null);
    setPasskeySubmitting(true);
    try {
      await loginWithPasskey();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Passkey login failed');
    } finally {
      setPasskeySubmitting(false);
    }
  }

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
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" onClick={handleLogin} disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
            {passkeySupported && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePasskeyLogin}
                disabled={passkeySubmitting}
              >
                {passkeySubmitting ? 'Waiting for passkey…' : 'Continue with a passkey'}
              </Button>
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

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

type LoginResponse =
  | { requiresTwoFactor: true }
  | { user: { id: string; email: string; name: string } };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        setNeedsTwoFactor(true);
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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{needsTwoFactor ? 'Enter your code' : 'Log in to OSSPlay'}</CardTitle>
          <CardDescription>
            {needsTwoFactor
              ? 'Enter the code from your authenticator app, or a recovery code.'
              : 'Enter your admin credentials.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {needsTwoFactor ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <FormField id="code" label="Code" value={code} onChange={setCode} required />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" onClick={handleVerify} disabled={submitting || !code}>
                {submitting ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <FormField
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                required
              />
              <FormField
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                required
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" onClick={handleLogin} disabled={submitting}>
                {submitting ? 'Logging in…' : 'Log in'}
              </Button>
              <Link
                href="/forgot-password"
                className="text-center text-sm text-muted-foreground underline"
              >
                Forgot password?
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

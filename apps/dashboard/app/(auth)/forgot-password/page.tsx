'use client';

import Link from 'next/link';
import { type FormEvent, type SyntheticEvent, useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

// Two recovery methods: email (if this instance has SMTP configured — a
// property of the instance, not the specific account, so it's checked via
// the same public /setup/status the setup/login gate already uses) and
// passkey (its own route, /forgot-password/passkey — a successful passkey
// ceremony is discoverable/usernameless, so it doesn't need an email
// upfront the way the email method does). Recovery codes aren't offered
// here: they only make sense once a password has already been proven, and
// the login flow already handles that case.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch<{ smtpConfigured: boolean }>('/setup/status').then((res) =>
      setSmtpConfigured(res.smtpConfigured),
    );
  }, []);

  async function handleSubmit(event: FormEvent | SyntheticEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    } finally {
      // Always show the same confirmation — the API itself never reveals
      // whether the email exists either.
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Choose how you&apos;d like to recover your account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sent ? (
            <p className="text-sm text-muted-foreground">
              If that email exists, a reset link has been sent.{' '}
              <Link href="/login" className="underline">
                Back to login
              </Link>
            </p>
          ) : (
            <>
              {smtpConfigured && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <FormField
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required
                    autoFocus
                  />
                  <Button type="submit" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </Button>
                </form>
              )}
              {smtpConfigured === false && (
                <p className="text-sm text-muted-foreground">
                  Email recovery isn&apos;t available on this instance. If you have a passkey, use
                  that instead — otherwise, contact your instance administrator.
                </p>
              )}
              <Link
                href="/forgot-password/passkey"
                className="text-center text-sm text-muted-foreground underline"
              >
                Use a passkey instead
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

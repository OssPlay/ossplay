'use client';

import Link from 'next/link';
import { type FormEvent, type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

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
          <CardDescription>We&apos;ll email you a link if the address exists.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-muted-foreground">
              If that email exists, a reset link has been sent.{' '}
              <Link href="/login" className="underline">
                Back to login
              </Link>
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <FormField
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                required
              />
              <Button type="submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

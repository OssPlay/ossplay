'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-muted-foreground">This reset link is missing its token.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField
        id="newPassword"
        label="New password"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
        required
        minLength={12}
        helpText="At least 12 characters."
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" onClick={handleSubmit} disabled={submitting || newPassword.length < 12}>
        {submitting ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>This link expires in 1 hour.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

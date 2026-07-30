'use client';

import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

type InviteDetails = {
  email: string;
  role: string;
  orgName: string;
  inviterName: string;
  accountExists: boolean;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    apiFetch<InviteDetails>(`/invitations/token/${token}`)
      .then(setDetails)
      .catch(() => setNotFound(true));
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/invitations/token/${token}/accept`, {
        method: 'POST',
        body: details?.accountExists ? undefined : JSON.stringify({ name, password }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept invitation');
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
        <p className="text-sm text-muted-foreground">This invitation is no longer valid.</p>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join {details.orgName}</CardTitle>
          <CardDescription>
            {details.inviterName} invited {details.email} to join as {details.role}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!details.accountExists && (
              <>
                <FormField id="name" label="Your name" value={name} onChange={setName} required />
                <FormField
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={12}
                  helpText="At least 12 characters."
                />
              </>
            )}
            {details.accountExists && (
              <p className="text-sm text-muted-foreground">
                Log in as {details.email}, then come back to this page to accept.
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Joining…' : 'Accept invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

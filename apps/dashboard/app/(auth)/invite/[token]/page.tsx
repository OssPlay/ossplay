'use client';

import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { apiFetch, errorMessage } from '@/lib/api';

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
  const { data: details, error: lookupError } = useSWR<InviteDetails>(
    `/invitations/token/${token}`,
  );
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const accept = useAction(
    () =>
      apiFetch(`/invitations/token/${token}/accept`, {
        method: 'POST',
        body: details?.accountExists ? undefined : JSON.stringify({ name, password }),
      }),
    { error: 'Could not accept invitation' },
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await accept
      .trigger()
      .then(() => {
        router.push('/');
        router.refresh();
      })
      .catch(() => {});
  }

  if (lookupError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-card">
        <p className="text-sm text-muted-foreground">This invitation is no longer valid.</p>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
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
                <FormField
                  id="name"
                  label="Your name"
                  value={name}
                  onChange={setName}
                  required
                  disabled={accept.isLoading}
                />
                <FormField
                  id="password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={12}
                  helpText="At least 12 characters."
                  disabled={accept.isLoading}
                />
              </>
            )}
            {details.accountExists && (
              <p className="text-sm text-muted-foreground">
                Log in as {details.email}, then come back to this page to accept.
              </p>
            )}
            <FormError
              message={
                accept.error ? errorMessage(accept.error, 'Could not accept invitation') : null
              }
            />
            <LoadingButton
              type="submit"
              loading={accept.isLoading}
              loadingText="Joining…"
              onClick={handleSubmit}
            >
              Accept invitation
            </LoadingButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

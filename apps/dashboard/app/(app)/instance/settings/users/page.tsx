'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAction } from '@/hooks/use-action';
import { ApiError, apiFetch, errorMessage } from '@/lib/api';

type InstanceUser = {
  id: string;
  email: string;
  name: string;
  instanceRole: string | null;
  totpEnabled: boolean;
  passkeyCount: number;
  createdAt: string;
  lastSignInAt: string | null;
};

// Root-only: force-reset another user's password or clear their second
// factors without them needing email/2FA access themselves. Distinct from
// (and more powerful than) anything a user can do to their own account —
// see ARCHITECTURE.md's Authorization Model section for why this is
// instance-root-only rather than also open to org owners/admins.
export default function InstanceUsersPage() {
  const { data, error, mutate } = useSWR<{ users: InstanceUser[] }>('/instance/users');
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  const users = data?.users ?? [];
  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>
          Every account on this instance. Resetting a password or 2FA here works even if the user
          has no access to their email or authenticator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>2FA / Passkeys</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRow key={user.id} user={user} onChange={() => mutate()} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function UserRow({ user, onChange }: { user: InstanceUser; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingReset2fa, setConfirmingReset2fa] = useState(false);

  const resetPassword = useAction(
    () =>
      apiFetch<{ temporaryPassword: string }>(`/instance/users/${user.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ generateTemporary: true }),
      }),
    { error: 'Could not reset password' },
  );

  const reset2fa = useAction(
    () => apiFetch(`/instance/users/${user.id}/reset-2fa`, { method: 'POST' }),
    { error: 'Could not reset 2FA' },
  );

  async function handleReset2fa() {
    await reset2fa
      .trigger()
      .then(() => {
        setConfirmingReset2fa(false);
        onChange();
      })
      .catch(() => {});
  }

  return (
    <>
      <TableRow>
        <TableCell>
          {user.name}
          {user.instanceRole === 'root' && (
            <Badge variant="secondary" className="ml-2">
              root
            </Badge>
          )}
        </TableCell>
        <TableCell>{user.email}</TableCell>
        <TableCell className="text-muted-foreground">
          {user.totpEnabled ? '2FA' : 'No 2FA'} · {user.passkeyCount} passkey
          {user.passkeyCount === 1 ? '' : 's'}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
        </TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Close' : 'Manage'}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5}>
            <div className="flex flex-col gap-3 py-2">
              {resetPassword.data ? (
                <p className="text-sm">
                  Temporary password (copy now, it won&apos;t be shown again):{' '}
                  <span className="font-mono">{resetPassword.data.temporaryPassword}</span>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    variant="outline"
                    size="sm"
                    loading={resetPassword.isLoading}
                    onClick={() => resetPassword.trigger()}
                  >
                    Reset password
                  </LoadingButton>
                  {user.totpEnabled || user.passkeyCount > 0 ? (
                    confirmingReset2fa ? (
                      <>
                        <LoadingButton
                          variant="destructive"
                          size="sm"
                          loading={reset2fa.isLoading}
                          onClick={handleReset2fa}
                        >
                          Confirm reset 2FA &amp; passkeys
                        </LoadingButton>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingReset2fa(false)}
                          disabled={reset2fa.isLoading}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmingReset2fa(true)}
                      >
                        Reset 2FA &amp; passkeys
                      </Button>
                    )
                  ) : null}
                </div>
              )}
              <FormError
                message={
                  resetPassword.error
                    ? errorMessage(resetPassword.error, 'Could not reset password')
                    : reset2fa.error
                      ? errorMessage(reset2fa.error, 'Could not reset 2FA')
                      : null
                }
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

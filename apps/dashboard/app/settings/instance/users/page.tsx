'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, apiFetch } from '@/lib/api';

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
  const [users, setUsers] = useState<InstanceUser[]>([]);
  const [forbidden, setForbidden] = useState(false);

  const refresh = useCallback(() => {
    apiFetch<{ users: InstanceUser[] }>('/instance/users')
      .then((res) => setUsers(res.users))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      });
  }, []);

  useEffect(refresh, [refresh]);

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

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
              <UserRow key={user.id} user={user} onChange={refresh} />
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
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function resetPassword() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ temporaryPassword: string }>(
        `/instance/users/${user.id}/password`,
        { method: 'PUT', body: JSON.stringify({ generateTemporary: true }) },
      );
      setTemporaryPassword(res.temporaryPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  }

  async function reset2fa() {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/instance/users/${user.id}/reset-2fa`, { method: 'POST' });
      setConfirmingReset2fa(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset 2FA');
    } finally {
      setSubmitting(false);
    }
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
              {temporaryPassword ? (
                <p className="text-sm">
                  Temporary password (copy now, it won&apos;t be shown again):{' '}
                  <span className="font-mono">{temporaryPassword}</span>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={resetPassword} disabled={submitting}>
                    Reset password
                  </Button>
                  {user.totpEnabled || user.passkeyCount > 0 ? (
                    confirmingReset2fa ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={reset2fa}
                          disabled={submitting}
                        >
                          Confirm reset 2FA &amp; passkeys
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingReset2fa(false)}
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
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

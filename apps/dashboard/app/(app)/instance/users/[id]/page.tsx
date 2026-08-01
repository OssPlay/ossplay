'use client';

import { ArrowLeftIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { FormError } from '@/components/form-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Container from '@/components/ui/container';
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

type UserDetail = {
  id: string;
  email: string;
  name: string;
  instanceRole: string | null;
  totpEnabled: boolean;
  disabledAt: string | null;
  passkeyCount: number;
  createdAt: string;
  lastSignInAt: string | null;
};
type OrgMembership = { id: string; name: string; role: string };
type UserDetailResponse = { user: UserDetail; organizations: OrgMembership[] };

const ORG_ROLES = ['member', 'admin', 'owner'] as const;

export default function InstanceUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, mutate } = useSWR<UserDetailResponse>(`/instance/users/${params.id}`);

  const forbidden = error instanceof ApiError && error.status === 403;
  const notFound = error instanceof ApiError && error.status === 404;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }
  if (notFound) {
    return <p className="text-sm text-muted-foreground">User not found.</p>;
  }
  if (!data) return null;

  const { user, organizations } = data;

  return (
    <Container
      header={{
        icon: UserIcon,
        title: user.name,
        description: user.email,
      }}
    >
      <div className="flex flex-col gap-6">
        <Link
          href="/instance/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
        >
          <ArrowLeftIcon className="size-4" /> Back to Users
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {user.instanceRole === 'root' && <Badge variant="secondary">root</Badge>}
          {user.disabledAt ? (
            <Badge variant="destructive">Blocked</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {user.totpEnabled ? '2FA enabled' : 'No 2FA'} · {user.passkeyCount} passkey
            {user.passkeyCount === 1 ? '' : 's'}
          </span>
          <span className="text-sm text-muted-foreground">
            Last sign-in:{' '}
            {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
          </span>
        </div>

        <SecurityActions user={user} onChange={() => mutate()} />
        <OrganizationsCard
          userId={user.id}
          organizations={organizations}
          onChange={() => mutate()}
        />
        <DangerZone user={user} onDeleted={() => router.replace('/instance/users')} />
      </div>
    </Container>
  );
}

function SecurityActions({ user, onChange }: { user: UserDetail; onChange: () => void }) {
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

  const toggleBlock = useAction(
    () =>
      apiFetch(`/instance/users/${user.id}/${user.disabledAt ? 'unblock' : 'block'}`, {
        method: 'PUT',
      }),
    { error: user.disabledAt ? 'Could not unblock user' : 'Could not block user' },
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

  async function handleToggleBlock() {
    await toggleBlock
      .trigger()
      .then(onChange)
      .catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
                <Button variant="outline" size="sm" onClick={() => setConfirmingReset2fa(true)}>
                  Reset 2FA &amp; passkeys
                </Button>
              )
            ) : null}

            <LoadingButton
              variant={user.disabledAt ? 'default' : 'outline'}
              size="sm"
              loading={toggleBlock.isLoading}
              onClick={handleToggleBlock}
            >
              {user.disabledAt ? 'Unblock user' : 'Block user'}
            </LoadingButton>
          </div>
        )}
        <FormError
          message={
            resetPassword.error
              ? errorMessage(resetPassword.error, 'Could not reset password')
              : reset2fa.error
                ? errorMessage(reset2fa.error, 'Could not reset 2FA')
                : toggleBlock.error
                  ? errorMessage(toggleBlock.error, 'Could not update block status')
                  : null
          }
        />
      </CardContent>
    </Card>
  );
}

function OrganizationsCard({
  userId,
  organizations,
  onChange,
}: {
  userId: string;
  organizations: OrgMembership[];
  onChange: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
      </CardHeader>
      <CardContent>
        {organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not a member of any organization.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <OrgMembershipRow key={org.id} userId={userId} org={org} onChange={onChange} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OrgMembershipRow({
  userId,
  org,
  onChange,
}: {
  userId: string;
  org: OrgMembership;
  onChange: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const changeRole = useAction(
    (role: string) =>
      apiFetch(`/instance/users/${userId}/organizations/${org.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    { error: 'Could not change role' },
  );

  const remove = useAction(
    () => apiFetch(`/instance/users/${userId}/organizations/${org.id}`, { method: 'DELETE' }),
    { error: 'Could not remove from organization' },
  );

  async function handleRemove() {
    await remove
      .trigger()
      .then(onChange)
      .catch(() => {});
  }

  return (
    <TableRow>
      <TableCell>{org.name}</TableCell>
      <TableCell>
        <select
          value={org.role}
          onChange={(e) =>
            changeRole
              .trigger(e.target.value)
              .then(onChange)
              .catch(() => {})
          }
          disabled={changeRole.isLoading}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {ORG_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="text-right">
        {confirmingRemove ? (
          <div className="flex justify-end gap-2">
            <LoadingButton
              variant="destructive"
              size="sm"
              loading={remove.isLoading}
              onClick={handleRemove}
            >
              Confirm remove
            </LoadingButton>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingRemove(false)}
              disabled={remove.isLoading}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(true)}>
            Remove
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function DangerZone({ user, onDeleted }: { user: UserDetail; onDeleted: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const deleteUser = useAction(() => apiFetch(`/instance/users/${user.id}`, { method: 'DELETE' }), {
    error: 'Could not delete user',
  });

  async function handleDelete() {
    await deleteUser
      .trigger()
      .then(onDeleted)
      .catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delete user</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError
          message={
            deleteUser.error ? errorMessage(deleteUser.error, 'Could not delete user') : null
          }
        />
        {confirmingDelete ? (
          <div className="flex gap-2">
            <LoadingButton
              variant="destructive"
              loading={deleteUser.isLoading}
              onClick={handleDelete}
            >
              Confirm delete
            </LoadingButton>
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleteUser.isLoading}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
            Delete user
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

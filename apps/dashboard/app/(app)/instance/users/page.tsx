'use client';

import { UsersIcon } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import Container from '@/components/ui/container';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';

type InstanceUser = {
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

// Root-only: manage identity/security for every account on this instance —
// force-reset a password or 2FA, block/delete, edit org roles. Distinct
// from (and more powerful than) anything an org-level Members page does —
// see ARCHITECTURE.md's Authorization Model section.
export default function InstanceUsersPage() {
  const { data, error } = useSWR<{ users: InstanceUser[] }>('/instance/users');
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  const users = data?.users ?? [];

  return (
    <Container
      header={{
        icon: UsersIcon,
        title: 'Users',
        description: 'Every account on this instance.',
      }}
    >
      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>2FA / Passkeys</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
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
                <TableCell>
                  {user.disabledAt ? (
                    <Badge variant="destructive">Blocked</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/instance/users/${user.id}`}
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    Manage
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  );
}

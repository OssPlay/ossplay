'use client';

import { useCallback, useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, apiFetch } from '@/lib/api';

type Me = { organizations: Array<{ orgId: string; orgName: string; role: string }> };
type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
  lastSignInAt: string | null;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  isExpired: boolean;
  createdAt: string;
};

const ROLES = ['member', 'admin', 'owner'] as const;

export default function OrganizationSettingsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [canManageMembers, setCanManageMembers] = useState(false);

  const refresh = useCallback((id: string) => {
    apiFetch<{ members: Member[] }>(`/organizations/${id}/members`).then((res) =>
      setMembers(res.members),
    );
    apiFetch<{ invitations: Invitation[] }>(`/organizations/${id}/invitations`)
      .then((res) => {
        setInvitations(res.invitations);
        setCanManageMembers(true);
      })
      .catch(() => setCanManageMembers(false));
  }, []);

  useEffect(() => {
    apiFetch<Me>('/auth/me').then((me) => {
      const org = me.organizations[0];
      if (!org) return;
      setOrgId(org.orgId);
      setOrgName(org.orgName);
      refresh(org.orgId);
    });
  }, [refresh]);

  if (!orgId) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{orgName}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{member.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.lastSignInAt ? new Date(member.lastSignInAt).toLocaleString() : 'Never'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManageMembers && (
        <>
          <InviteCard orgId={orgId} onInvited={() => refresh(orgId)} />
          <InvitationsCard invitations={invitations} onChange={() => refresh(orgId)} />
        </>
      )}
    </div>
  );
}

function InviteCard({ orgId, onInvited }: { orgId: string; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('member');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setWarning(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ warning?: string }>(`/organizations/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      if (res.warning) setWarning(res.warning);
      setEmail('');
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send invitation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField
              id="inviteEmail"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inviteRole">Role</Label>
            <select
              id="inviteRole"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !email}>
            Invite
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {warning && (
          <p className="text-sm text-muted-foreground">{warning} — share the link manually.</p>
        )}
      </CardContent>
    </Card>
  );
}

function InvitationsCard({
  invitations,
  onChange,
}: {
  invitations: Invitation[];
  onChange: () => void;
}) {
  async function revoke(id: string) {
    await apiFetch(`/invitations/${id}/revoke`, { method: 'POST' });
    onChange();
  }

  const pending = invitations.filter((i) => i.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{invitation.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {invitation.isExpired ? 'Expired' : 'Pending'}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => revoke(invitation.id)}>
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

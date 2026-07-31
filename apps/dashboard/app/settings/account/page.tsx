'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
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
import { apiFetch, errorMessage } from '@/lib/api';
import { browserSupportsWebAuthn, registerPasskey } from '@/lib/passkey';

type Me = {
  user: {
    id: string;
    email: string;
    name: string;
    instanceRole: string | null;
    totpEnabled: boolean;
    recoveryCodesRemaining: number;
  };
};

type PasskeyRow = {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  transports: string[] | null;
};

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export default function AccountSettingsPage() {
  const { data: me, mutate: mutateMe } = useSWR<Me>('/auth/me');
  const { data: sessionsData, mutate: mutateSessions } = useSWR<{ sessions: SessionRow[] }>(
    '/auth/sessions',
  );

  if (!me) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{me.user.name}</p>
          <p className="text-muted-foreground">{me.user.email}</p>
        </CardContent>
      </Card>

      <ChangePasswordCard />
      <PasskeysCard />
      <TwoFactorCard
        totpEnabled={me.user.totpEnabled}
        recoveryCodesRemaining={me.user.recoveryCodesRemaining}
        onChange={() => mutateMe()}
      />
      <SessionsCard sessions={sessionsData?.sessions ?? []} onChange={() => mutateSessions()} />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const changePassword = useAction(
    () =>
      apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    { error: 'Could not change password' },
  );

  async function handleSubmit() {
    setSuccess(false);
    await changePassword
      .trigger()
      .then(() => {
        setCurrentPassword('');
        setNewPassword('');
        setSuccess(true);
      })
      .catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField
          id="currentPassword"
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          disabled={changePassword.isLoading}
        />
        <FormField
          id="newPassword"
          label="New password"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          minLength={12}
          helpText="At least 12 characters."
          disabled={changePassword.isLoading}
        />
        <FormError
          message={
            changePassword.error
              ? errorMessage(changePassword.error, 'Could not change password')
              : null
          }
        />
        {success && <p className="text-sm text-muted-foreground">Password changed.</p>}
        <LoadingButton
          type="button"
          loading={changePassword.isLoading}
          onClick={handleSubmit}
          disabled={!currentPassword || newPassword.length < 12}
        >
          Change password
        </LoadingButton>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard({
  totpEnabled,
  recoveryCodesRemaining,
  onChange,
}: {
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  onChange: () => void;
}) {
  const [step, setStep] = useState<'idle' | 'setup' | 'recovery-codes' | 'regenerate'>('idle');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState('');

  const setupAction = useAction(
    () => apiFetch<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { method: 'POST' }),
    { error: 'Could not start 2FA setup' },
  );
  const confirmAction = useAction(
    () =>
      apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    { error: 'Invalid code' },
  );
  const regenerateAction = useAction(
    () =>
      apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes/regenerate', {
        method: 'POST',
        body: JSON.stringify({ password: regeneratePassword }),
      }),
    { error: 'Could not regenerate recovery codes' },
  );
  const disableAction = useAction(
    () =>
      apiFetch('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      }),
    { error: 'Could not disable 2FA' },
  );

  async function startSetup() {
    await setupAction
      .trigger()
      .then(() => setStep('setup'))
      .catch(() => {});
  }

  async function confirmSetup() {
    await confirmAction
      .trigger()
      .then((res) => {
        setRecoveryCodes(res.recoveryCodes);
        setStep('recovery-codes');
        setCode('');
      })
      .catch(() => {});
  }

  async function regenerateRecoveryCodes() {
    await regenerateAction
      .trigger()
      .then((res) => {
        setRecoveryCodes(res.recoveryCodes);
        setRegeneratePassword('');
        setStep('recovery-codes');
      })
      .catch(() => {});
  }

  function finishSetup() {
    setStep('idle');
    setRecoveryCodes([]);
    onChange();
  }

  async function disable2fa() {
    await disableAction
      .trigger()
      .then(() => {
        setShowDisable(false);
        setDisablePassword('');
        setDisableCode('');
        onChange();
      })
      .catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          {totpEnabled ? 'Enabled — an authenticator code is required to log in.' : 'Not enabled.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step === 'idle' && !totpEnabled && (
          <LoadingButton loading={setupAction.isLoading} onClick={startSetup}>
            Enable 2FA
          </LoadingButton>
        )}

        {step === 'setup' && (
          <div className="flex flex-col gap-4">
            <div className="w-fit rounded-lg border border-border bg-white p-3">
              <QRCode value={setupAction.data?.otpauthUrl ?? ''} size={160} />
            </div>
            <p className="text-xs text-muted-foreground break-all">
              {setupAction.data?.otpauthUrl}
            </p>
            <FormField
              id="totpCode"
              label="Enter the 6-digit code from your app"
              value={code}
              onChange={setCode}
              disabled={confirmAction.isLoading}
            />
            <FormError
              message={
                confirmAction.error ? errorMessage(confirmAction.error, 'Invalid code') : null
              }
            />
            <LoadingButton
              loading={confirmAction.isLoading}
              onClick={confirmSetup}
              disabled={code.length !== 6}
            >
              Confirm
            </LoadingButton>
          </div>
        )}

        {step === 'recovery-codes' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Save these recovery codes somewhere safe. Each one can be used once if you lose access
              to your authenticator app. They won&apos;t be shown again.
            </p>
            <ul className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
              {recoveryCodes.map((rc) => (
                <li key={rc}>{rc}</li>
              ))}
            </ul>
            <Button onClick={finishSetup}>I&apos;ve saved these codes</Button>
          </div>
        )}

        {step === 'idle' && totpEnabled && (
          <p className="text-sm text-muted-foreground">
            {recoveryCodesRemaining} recovery code{recoveryCodesRemaining === 1 ? '' : 's'}{' '}
            remaining.
          </p>
        )}

        {step === 'idle' && totpEnabled && (
          <Button variant="outline" onClick={() => setStep('regenerate')}>
            Regenerate recovery codes
          </Button>
        )}

        {step === 'regenerate' && (
          <div className="flex flex-col gap-4">
            <FormField
              id="regeneratePassword"
              label="Password"
              type="password"
              value={regeneratePassword}
              onChange={setRegeneratePassword}
              disabled={regenerateAction.isLoading}
            />
            <FormError
              message={
                regenerateAction.error
                  ? errorMessage(regenerateAction.error, 'Could not regenerate recovery codes')
                  : null
              }
            />
            <div className="flex gap-2">
              <LoadingButton
                loading={regenerateAction.isLoading}
                onClick={regenerateRecoveryCodes}
                disabled={!regeneratePassword}
              >
                Regenerate
              </LoadingButton>
              <Button
                variant="ghost"
                onClick={() => setStep('idle')}
                disabled={regenerateAction.isLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'idle' && totpEnabled && !showDisable && (
          <Button variant="outline" onClick={() => setShowDisable(true)}>
            Disable 2FA
          </Button>
        )}

        {step === 'idle' && totpEnabled && showDisable && (
          <div className="flex flex-col gap-4">
            <FormField
              id="disablePassword"
              label="Password"
              type="password"
              value={disablePassword}
              onChange={setDisablePassword}
              disabled={disableAction.isLoading}
            />
            <FormField
              id="disableCode"
              label="Authenticator or recovery code"
              value={disableCode}
              onChange={setDisableCode}
              disabled={disableAction.isLoading}
            />
            <FormError
              message={
                disableAction.error
                  ? errorMessage(disableAction.error, 'Could not disable 2FA')
                  : null
              }
            />
            <LoadingButton
              variant="destructive"
              loading={disableAction.isLoading}
              onClick={disable2fa}
              disabled={!disablePassword || !disableCode}
            >
              Confirm disable
            </LoadingButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PasskeysCard() {
  const { data, mutate } = useSWR<{ credentials: PasskeyRow[] }>('/auth/passkey');
  const passkeys = data?.credentials ?? [];
  const [deviceName, setDeviceName] = useState('');
  // Checked after mount, not during render, so the server-rendered HTML
  // matches the client's first render — same reasoning as the /login
  // passkey button.
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  const register = useAction(() => registerPasskey(deviceName || undefined), {
    error: 'Could not register passkey',
  });

  async function handleRegister() {
    await register
      .trigger()
      .then(() => {
        setDeviceName('');
        mutate();
      })
      .catch(() => {});
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in without a password. A passkey is a full alternative to your password, not a second
          factor on top of it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {passkeys.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {passkeys.map((passkey) => (
                <PasskeyRowItem key={passkey.id} passkey={passkey} onRemoved={() => mutate()} />
              ))}
            </TableBody>
          </Table>
        )}

        {supported ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField
                id="passkeyDeviceName"
                label="Name (optional)"
                value={deviceName}
                onChange={setDeviceName}
                helpText="e.g. “MacBook Touch ID”"
                disabled={register.isLoading}
              />
            </div>
            <LoadingButton
              type="button"
              loading={register.isLoading}
              loadingText="Waiting for passkey…"
              onClick={handleRegister}
            >
              Add a passkey
            </LoadingButton>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This browser doesn&apos;t support passkeys.
          </p>
        )}
        <FormError
          message={
            register.error ? errorMessage(register.error, 'Could not register passkey') : null
          }
        />
      </CardContent>
    </Card>
  );
}

function PasskeyRowItem({ passkey, onRemoved }: { passkey: PasskeyRow; onRemoved: () => void }) {
  const remove = useAction(() => apiFetch(`/auth/passkey/${passkey.id}`, { method: 'DELETE' }), {
    error: 'Could not remove passkey',
  });

  async function handleRemove() {
    await remove
      .trigger()
      .then(onRemoved)
      .catch(() => {});
  }

  return (
    <TableRow>
      <TableCell>{passkey.deviceName ?? 'Unnamed passkey'}</TableCell>
      <TableCell>{new Date(passkey.createdAt).toLocaleDateString()}</TableCell>
      <TableCell className="text-muted-foreground">
        {passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleDateString() : 'Never'}
      </TableCell>
      <TableCell className="text-right">
        <LoadingButton variant="ghost" size="sm" loading={remove.isLoading} onClick={handleRemove}>
          Remove
        </LoadingButton>
      </TableCell>
    </TableRow>
  );
}

function SessionsCard({ sessions, onChange }: { sessions: SessionRow[]; onChange: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <SessionRowItem key={session.id} session={session} onRevoked={onChange} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SessionRowItem({ session, onRevoked }: { session: SessionRow; onRevoked: () => void }) {
  const revoke = useAction(() => apiFetch(`/auth/sessions/${session.id}`, { method: 'DELETE' }), {
    error: 'Could not revoke session',
  });

  async function handleRevoke() {
    await revoke
      .trigger()
      .then(onRevoked)
      .catch(() => {});
  }

  return (
    <TableRow>
      <TableCell>{session.ipAddress ?? 'unknown'}</TableCell>
      <TableCell className="max-w-[240px] truncate">{session.userAgent ?? 'unknown'}</TableCell>
      <TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
      <TableCell className="text-right">
        {session.isCurrent ? (
          <Badge variant="secondary">Current</Badge>
        ) : (
          <LoadingButton
            variant="ghost"
            size="sm"
            loading={revoke.isLoading}
            onClick={handleRevoke}
          >
            Revoke
          </LoadingButton>
        )}
      </TableCell>
    </TableRow>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { FormField } from '@/components/auth/form-field';
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
  const [me, setMe] = useState<Me['user'] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  function refresh() {
    apiFetch<Me>('/auth/me').then((res) => setMe(res.user));
    apiFetch<{ sessions: SessionRow[] }>('/auth/sessions').then((res) => setSessions(res.sessions));
  }

  useEffect(refresh, []);

  if (!me) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{me.name}</p>
          <p className="text-muted-foreground">{me.email}</p>
        </CardContent>
      </Card>

      <ChangePasswordCard />
      <PasskeysCard />
      <TwoFactorCard
        totpEnabled={me.totpEnabled}
        recoveryCodesRemaining={me.recoveryCodesRemaining}
        onChange={refresh}
      />
      <SessionsCard sessions={sessions} onChange={refresh} />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setSubmitting(false);
    }
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
        />
        <FormField
          id="newPassword"
          label="New password"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          minLength={12}
          helpText="At least 12 characters."
        />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {success && <p className="text-sm text-muted-foreground">Password changed.</p>}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !currentPassword || newPassword.length < 12}
        >
          {submitting ? 'Changing…' : 'Change password'}
        </Button>
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
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState('');

  async function startSetup() {
    setError(null);
    const res = await apiFetch<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {
      method: 'POST',
    });
    setOtpauthUrl(res.otpauthUrl);
    setStep('setup');
  }

  async function confirmSetup() {
    setError(null);
    try {
      const res = await apiFetch<{ recoveryCodes: string[] }>('/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setRecoveryCodes(res.recoveryCodes);
      setStep('recovery-codes');
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code');
    }
  }

  async function regenerateRecoveryCodes() {
    setError(null);
    try {
      const res = await apiFetch<{ recoveryCodes: string[] }>(
        '/auth/2fa/recovery-codes/regenerate',
        {
          method: 'POST',
          body: JSON.stringify({ password: regeneratePassword }),
        },
      );
      setRecoveryCodes(res.recoveryCodes);
      setRegeneratePassword('');
      setStep('recovery-codes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate recovery codes');
    }
  }

  function finishSetup() {
    setStep('idle');
    setRecoveryCodes([]);
    onChange();
  }

  async function disable() {
    setError(null);
    try {
      await apiFetch('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not disable 2FA');
    }
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
        {step === 'idle' && !totpEnabled && <Button onClick={startSetup}>Enable 2FA</Button>}

        {step === 'setup' && (
          <div className="flex flex-col gap-4">
            <div className="w-fit rounded-lg border border-border bg-white p-3">
              <QRCode value={otpauthUrl} size={160} />
            </div>
            <p className="text-xs text-muted-foreground break-all">{otpauthUrl}</p>
            <FormField
              id="totpCode"
              label="Enter the 6-digit code from your app"
              value={code}
              onChange={setCode}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button onClick={confirmSetup} disabled={code.length !== 6}>
              Confirm
            </Button>
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
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={regenerateRecoveryCodes} disabled={!regeneratePassword}>
                Regenerate
              </Button>
              <Button variant="ghost" onClick={() => setStep('idle')}>
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
            />
            <FormField
              id="disableCode"
              label="Authenticator or recovery code"
              value={disableCode}
              onChange={setDisableCode}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              variant="destructive"
              onClick={disable}
              disabled={!disablePassword || !disableCode}
            >
              Confirm disable
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PasskeysCard() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Checked after mount, not during render, so the server-rendered HTML
  // matches the client's first render — same reasoning as the /login
  // passkey button.
  const [supported, setSupported] = useState(false);

  const refresh = useCallback(() => {
    apiFetch<{ credentials: PasskeyRow[] }>('/auth/passkey').then((res) =>
      setPasskeys(res.credentials),
    );
  }, []);

  useEffect(() => {
    refresh();
    setSupported(browserSupportsWebAuthn());
  }, [refresh]);

  async function handleRegister() {
    setError(null);
    setSubmitting(true);
    try {
      await registerPasskey(deviceName || undefined);
      setDeviceName('');
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register passkey');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/auth/passkey/${id}`, { method: 'DELETE' });
    refresh();
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
                <TableRow key={passkey.id}>
                  <TableCell>{passkey.deviceName ?? 'Unnamed passkey'}</TableCell>
                  <TableCell>{new Date(passkey.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {passkey.lastUsedAt
                      ? new Date(passkey.lastUsedAt).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(passkey.id)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
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
              />
            </div>
            <Button type="button" onClick={handleRegister} disabled={submitting}>
              {submitting ? 'Waiting for passkey…' : 'Add a passkey'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This browser doesn&apos;t support passkeys.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsCard({ sessions, onChange }: { sessions: SessionRow[]; onChange: () => void }) {
  async function revoke(id: string) {
    await apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' });
    onChange();
  }

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
              <TableRow key={session.id}>
                <TableCell>{session.ipAddress ?? 'unknown'}</TableCell>
                <TableCell className="max-w-[240px] truncate">
                  {session.userAgent ?? 'unknown'}
                </TableCell>
                <TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {session.isCurrent ? (
                    <Badge variant="secondary">Current</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => revoke(session.id)}>
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError, apiFetch } from '@/lib/api';

type InstanceSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordSet: boolean;
  smtpFromAddress: string | null;
  smtpFromName: string | null;
  smtpSecure: boolean;
};

export default function InstanceSettingsPage() {
  const [settings, setSettings] = useState<InstanceSettings | null>(null);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromAddress, setSmtpFromAddress] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    apiFetch<InstanceSettings>('/instance/settings')
      .then((res) => {
        setSettings(res);
        setSmtpHost(res.smtpHost ?? '');
        setSmtpPort(res.smtpPort ? String(res.smtpPort) : '');
        setSmtpUsername(res.smtpUsername ?? '');
        setSmtpFromAddress(res.smtpFromAddress ?? '');
        setSmtpFromName(res.smtpFromName ?? '');
        setSmtpSecure(res.smtpSecure);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      });
  }, []);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await apiFetch('/instance/settings', {
        method: 'PUT',
        body: JSON.stringify({
          smtpHost: smtpHost || null,
          smtpPort: smtpPort ? Number(smtpPort) : null,
          smtpUsername: smtpUsername || null,
          // Omitted entirely if left blank, so an existing stored password
          // isn't wiped just because the field wasn't re-typed.
          ...(smtpPassword ? { smtpPassword } : {}),
          smtpFromAddress: smtpFromAddress || null,
          smtpFromName: smtpFromName || null,
          smtpSecure,
        }),
      });
      setSmtpPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings');
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMTP</CardTitle>
        <CardDescription>Used to send invitation and password-reset emails.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField id="smtpHost" label="Host" value={smtpHost} onChange={setSmtpHost} />
        <FormField id="smtpPort" label="Port" value={smtpPort} onChange={setSmtpPort} />
        <FormField
          id="smtpUsername"
          label="Username"
          value={smtpUsername}
          onChange={setSmtpUsername}
        />
        <FormField
          id="smtpPassword"
          label="Password"
          type="password"
          value={smtpPassword}
          onChange={setSmtpPassword}
          helpText={
            settings.smtpPasswordSet ? 'A password is set. Leave blank to keep it.' : undefined
          }
        />
        <FormField
          id="smtpFromAddress"
          label="From address"
          type="email"
          value={smtpFromAddress}
          onChange={setSmtpFromAddress}
        />
        <FormField
          id="smtpFromName"
          label="From name"
          value={smtpFromName}
          onChange={setSmtpFromName}
        />
        <div className="flex items-center gap-2">
          <Switch id="smtpSecure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
          <Label htmlFor="smtpSecure">Use TLS</Label>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {success && <p className="text-sm text-muted-foreground">Saved.</p>}
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/ui/loading-button';
import { Switch } from '@/components/ui/switch';
import { useAction } from '@/hooks/use-action';
import { ApiError, apiFetch, errorMessage } from '@/lib/api';

type InstanceSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordSet: boolean;
  smtpFromAddress: string | null;
  smtpFromName: string | null;
  smtpSecure: boolean;
};

// Shared by /settings/instance and /onboarding/smtp — same fields, same
// PUT /instance/settings call. `saveLabel`/`onSaved` are the only things
// that differ between the two call sites (settings just says "Saved.";
// onboarding advances to the next step).
export function SmtpForm({
  saveLabel = 'Save',
  onSaved,
}: {
  saveLabel?: string;
  onSaved?: () => void;
}) {
  const {
    data: settings,
    error: settingsError,
    mutate,
  } = useSWR<InstanceSettings>('/instance/settings');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromAddress, setSmtpFromAddress] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [success, setSuccess] = useState(false);
  // Seeds the editable fields from the fetched value exactly once — a
  // background SWR revalidation must not stomp on what the user is
  // currently typing.
  const seeded = useRef(false);

  useEffect(() => {
    if (settings && !seeded.current) {
      setSmtpHost(settings.smtpHost ?? '');
      setSmtpPort(settings.smtpPort ? String(settings.smtpPort) : '');
      setSmtpUsername(settings.smtpUsername ?? '');
      setSmtpFromAddress(settings.smtpFromAddress ?? '');
      setSmtpFromName(settings.smtpFromName ?? '');
      setSmtpSecure(settings.smtpSecure);
      seeded.current = true;
    }
  }, [settings]);

  const save = useAction(
    () =>
      apiFetch('/instance/settings', {
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
      }),
    { error: 'Could not save settings' },
  );

  async function handleSubmit() {
    setSuccess(false);
    await save
      .trigger()
      .then(() => {
        setSmtpPassword('');
        setSuccess(true);
        mutate();
        onSaved?.();
      })
      .catch(() => {});
  }

  const forbidden = settingsError instanceof ApiError && settingsError.status === 403;
  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  if (!settings) return null;

  return (
    <div className="flex flex-col gap-4">
      <FormField
        id="smtpHost"
        label="Host"
        value={smtpHost}
        onChange={setSmtpHost}
        disabled={save.isLoading}
      />
      <FormField
        id="smtpPort"
        label="Port"
        value={smtpPort}
        onChange={setSmtpPort}
        disabled={save.isLoading}
      />
      <FormField
        id="smtpUsername"
        label="Username"
        value={smtpUsername}
        onChange={setSmtpUsername}
        disabled={save.isLoading}
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
        disabled={save.isLoading}
      />
      <FormField
        id="smtpFromAddress"
        label="From address"
        type="email"
        value={smtpFromAddress}
        onChange={setSmtpFromAddress}
        disabled={save.isLoading}
      />
      <FormField
        id="smtpFromName"
        label="From name"
        value={smtpFromName}
        onChange={setSmtpFromName}
        disabled={save.isLoading}
      />
      <div className="flex items-center gap-2">
        <Switch
          id="smtpSecure"
          checked={smtpSecure}
          onCheckedChange={setSmtpSecure}
          disabled={save.isLoading}
        />
        <Label htmlFor="smtpSecure">Use TLS</Label>
      </div>
      <FormError
        message={save.error ? errorMessage(save.error, 'Could not save settings') : null}
      />
      {success && <p className="text-sm text-muted-foreground">Saved.</p>}
      <LoadingButton type="button" loading={save.isLoading} onClick={handleSubmit}>
        {saveLabel}
      </LoadingButton>
    </div>
  );
}

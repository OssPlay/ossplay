'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';
import { useAction } from '@/hooks/use-action';
import { apiFetch, errorMessage } from '@/lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  const passwordsMismatched = confirmPassword.length > 0 && adminPassword !== confirmPassword;

  const setup = useAction(
    () =>
      apiFetch('/setup', {
        method: 'POST',
        body: JSON.stringify({ adminName, adminEmail, adminPassword }),
      }),
    { error: 'Setup failed' },
  );

  // Explicit preventDefault on both the form's submit (Enter key in a text
  // field) and the button's click — belt and suspenders against native form
  // submission ever navigating the page instead of running this handler.
  //
  // Org creation moved to /onboarding — this only creates the admin account
  // now, so a fresh setup always lands there next, not on the dashboard.
  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (adminPassword !== confirmPassword) {
      setMismatchError('Passwords do not match');
      return;
    }
    setMismatchError(null);
    await setup
      .trigger()
      .then(() => {
        router.push('/onboarding');
        router.refresh();
      })
      .catch(() => {});
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-card">
      <Card className="w-full max-w-md bg-transparent ring-0">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            <Image
              src="/statics/logo.png"
              alt="OSSPlay"
              width={40}
              height={40}
              className="inline-block mr-2 -mt-1"
            />
            Set up OSSPlay
          </CardTitle>
          <CardDescription>Create the admin account for this instance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              id="adminName"
              label="Your name"
              value={adminName}
              onChange={setAdminName}
              required
              autoComplete="name"
              autoFocus
              disabled={setup.isLoading}
            />
            <FormField
              id="adminEmail"
              label="Email"
              type="email"
              value={adminEmail}
              onChange={setAdminEmail}
              required
              autoComplete="email"
              disabled={setup.isLoading}
            />
            <FormField
              id="adminPassword"
              label="Password"
              type="password"
              value={adminPassword}
              onChange={setAdminPassword}
              required
              minLength={12}
              helpText="At least 12 characters."
              autoComplete="new-password"
              disabled={setup.isLoading}
            />
            <FormField
              id="confirmPassword"
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              minLength={12}
              autoComplete="new-password"
              helpText={passwordsMismatched ? 'Passwords do not match.' : undefined}
              disabled={setup.isLoading}
            />
            <FormError
              message={
                mismatchError ?? (setup.error ? errorMessage(setup.error, 'Setup failed') : null)
              }
            />
            <LoadingButton
              type="submit"
              loading={setup.isLoading}
              loadingText="Setting up…"
              onClick={handleSubmit}
              disabled={passwordsMismatched}
            >
              Create admin account
            </LoadingButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

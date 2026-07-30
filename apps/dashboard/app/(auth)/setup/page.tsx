'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordsMismatched = confirmPassword.length > 0 && adminPassword !== confirmPassword;

  // Explicit preventDefault on both the form's submit (Enter key in a text
  // field) and the button's click — belt and suspenders against native form
  // submission ever navigating the page instead of running this handler.
  //
  // Org creation moved to /onboarding — this only creates the admin account
  // now, so a fresh setup always lands there next, not on the dashboard.
  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/setup', {
        method: 'POST',
        body: JSON.stringify({ adminName, adminEmail, adminPassword }),
      });
      router.push('/onboarding');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
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
            />
            <FormField
              id="adminEmail"
              label="Email"
              type="email"
              value={adminEmail}
              onChange={setAdminEmail}
              required
              autoComplete="email"
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
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting || passwordsMismatched}
            >
              {submitting ? 'Setting up…' : 'Create admin account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

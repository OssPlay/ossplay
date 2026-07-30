'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/setup', {
        method: 'POST',
        body: JSON.stringify({ adminName, adminEmail, adminPassword, orgName }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set up OSSPlay</CardTitle>
          <CardDescription>Create the admin account and your first organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField
              id="adminName"
              label="Your name"
              value={adminName}
              onChange={setAdminName}
              required
            />
            <FormField
              id="adminEmail"
              label="Email"
              type="email"
              value={adminEmail}
              onChange={setAdminEmail}
              required
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
            />
            <FormField
              id="orgName"
              label="Organization name"
              value={orgName}
              onChange={setOrgName}
              required
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Setting up…' : 'Create admin account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { CardDescription } from '@/components/ui/card';
import { ApiError, apiFetch } from '@/lib/api';

// The only required onboarding step — an instance needs at least one
// organization before the dashboard itself is useful for anything.
export default function OnboardingOrganizationStep() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/organizations', { method: 'POST', body: JSON.stringify({ name }) });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create organization');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CardDescription>Create your first organization to finish setup.</CardDescription>
      <FormField
        id="orgName"
        label="Organization name"
        value={name}
        onChange={setName}
        required
        autoFocus
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" onClick={handleSubmit} disabled={submitting || !name}>
        {submitting ? 'Creating…' : 'Finish setup'}
      </Button>
    </form>
  );
}

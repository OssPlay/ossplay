'use client';

import { LoaderCircleIcon, LogOutIcon, RefreshCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React from 'react';
import { toast } from 'sonner';
import useSWR, { type KeyedMutator } from 'swr';
import { useAction } from '@/hooks/use-action';
import useURL from '@/hooks/use-url';
import { useActiveActionCount } from '@/lib/action-store';
import { apiFetch } from '@/lib/api';
import type { Auth, Me } from '@/types/auth';
import ErrorBoundary from '../layout/error-boundary';

const defaultUser = {
  id: '',
  email: '',
  name: '',
  instanceRole: null,
  totpEnabled: false,
  recoveryCodesRemaining: 0,
};

export const AuthContext = React.createContext<Auth>({
  isLoading: true,
  user: defaultUser,
  organizations: [],
  handleLogout: async () => {},
  mutate: (() => Promise.resolve()) as unknown as KeyedMutator<Me>,
});

export function useAuth() {
  return React.useContext(AuthContext);
}

export default function AuthProvider({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const activeActionCount = useActiveActionCount();
  const url = useURL();
  const { data: me, isLoading, error, mutate } = useSWR<Me>('/auth/me');

  const logout = useAction(() => apiFetch('/auth/logout', { method: 'POST' }), { error: null });

  async function handleLogout(to?: URL | string): Promise<void> {
    if (activeActionCount > 0) {
      toast.info('Please wait for the current action to finish.');
      return;
    }
    try {
      await logout.trigger();
    } catch (e) {
      toast.error('Failed to log out.');
    } finally {
      // Always navigate away, even if the server-side logout call failed —
      // clearing local state matters more than a clean server round-trip.
      router.replace(`/login${to ? `?continue=${encodeURIComponent(String(to))}` : ''}`);
      router.refresh();
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <LoaderCircleIcon className="size-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8">
        <ErrorBoundary
          error={error}
          description="Failed to authenticate your session. Please try again."
          // action={handleLogin}
          actions={[
            {
              text: 'Logout',
              icon: LogOutIcon,
              onClick: () => handleLogout(url),
              variant: 'destructive',
            },
            {
              text: 'Retry',
              icon: RefreshCwIcon,
              onClick: mutate,
            },
          ]}
        />
      </div>
    );
  }

  return (
    <AuthContext
      value={{
        user: me?.user ?? defaultUser,
        organizations: me?.organizations ?? [],
        isLoading: isLoading || logout.isLoading,
        handleLogout,
        mutate,
      }}
    >
      {children}
    </AuthContext>
  );
}

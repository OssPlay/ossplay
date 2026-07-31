'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAction } from '@/hooks/use-action';
import { useActiveActionCount } from '@/lib/action-store';
import { apiFetch } from '@/lib/api';

export interface UseLogoutResult {
  handleLogout: () => Promise<void>;
  isLoading: boolean;
}

// Shared by the home page's Logout button and the account dropdown — both
// need the same "block while another action is running, then hard-redirect
// regardless of whether the server call itself succeeded" behavior.
export function useLogout(): UseLogoutResult {
  const router = useRouter();
  const activeActionCount = useActiveActionCount();
  const logout = useAction(() => apiFetch('/auth/logout', { method: 'POST' }), { error: null });

  async function handleLogout(): Promise<void> {
    if (activeActionCount > 0) {
      toast.info('Please wait for the current action to finish.');
      return;
    }
    try {
      await logout.trigger();
    } finally {
      // Always navigate away, even if the server-side logout call failed —
      // clearing local state matters more than a clean server round-trip.
      router.replace('/login');
      router.refresh();
    }
  }

  return { handleLogout, isLoading: logout.isLoading };
}

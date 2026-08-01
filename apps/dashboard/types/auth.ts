import type { KeyedMutator } from 'swr';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  instanceRole: string | null;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
}

export interface MeProject {
  id: string;
  name: string;
}

export interface MeOrganization {
  id: string;
  name: string;
  role: string;
  projects: Array<MeProject>;
}

export interface Me {
  user: MeUser;
  organizations: Array<MeOrganization>;
}

export interface Auth extends Me {
  isLoading: boolean;
  handleLogout: (to?: string) => Promise<void>;
  mutate: KeyedMutator<Me>;
}

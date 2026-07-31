'use client';

import { ArrowLeftIcon, FolderIcon } from 'lucide-react';
import useSWR from 'swr';
import { Section } from '@/components/layout/section';
import { useCurrentOrgId } from '@/lib/current-org';
import { useCurrentProjectId } from '@/lib/current-project';
import type { Sidepanel } from '@/lib/nav-types';

type Me = { organizations: Array<{ orgId: string; orgName: string; role: string }> };
type Project = { id: string; name: string; orgId: string };

const sidepanel: Sidepanel = [
  { title: 'Back to Dashboard', href: '/', icon: ArrowLeftIcon },
  { title: 'General', href: '/project/settings', icon: FolderIcon },
];

export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useSWR<Me>('/auth/me');
  const orgId = useCurrentOrgId(me?.organizations.map((o) => o.orgId));
  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    orgId ? `/organizations/${orgId}/projects` : null,
  );
  const projectList = projectsData?.projects ?? [];
  const projectId = useCurrentProjectId(projectsData ? projectList.map((p) => p.id) : undefined);
  const access = projectsData ? projectList.some((p) => p.id === projectId) : undefined;

  return (
    <Section sidepanel={sidepanel} breadcrumb={{ title: 'Project' }} access={access}>
      {children}
    </Section>
  );
}

'use client';

import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useAction } from '@/hooks/use-action';
import { apiFetch, errorMessage } from '@/lib/api';
import { useCurrentOrgId } from '@/lib/current-org';
import { setCurrentProjectId, useCurrentProjectId } from '@/lib/current-project';

type Me = { organizations: Array<{ orgId: string; orgName: string; role: string }> };
type Project = { id: string; name: string; orgId: string };

export function ProjectSwitcher() {
  const { data: me } = useSWR<Me>('/auth/me');
  const orgId = useCurrentOrgId(me?.organizations.map((o) => o.orgId));
  const org = me?.organizations.find((o) => o.orgId === orgId);

  const { data: projectsData, mutate } = useSWR<{ projects: Project[] }>(
    orgId ? `/organizations/${orgId}/projects` : null,
  );
  const projectList = projectsData?.projects ?? [];
  const projectId = useCurrentProjectId(projectsData ? projectList.map((p) => p.id) : undefined);
  const currentProject = projectList.find((p) => p.id === projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');

  const createProject = useAction(
    () =>
      apiFetch<{ project: Project }>(`/organizations/${orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    { error: 'Could not create project' },
  );

  async function handleCreate() {
    await createProject
      .trigger()
      .then((res) => {
        setCurrentProjectId(res.project.id);
        setName('');
        setDialogOpen(false);
        mutate();
      })
      .catch(() => {});
  }

  if (!org) return null;

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <FolderIcon className="size-4" />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden leading-none">
                <span className="truncate font-medium">{currentProject?.name ?? 'No project'}</span>
                <span className="truncate text-xs text-muted-foreground">{org.orgName}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                {projectList.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No projects yet — create one below.
                  </p>
                )}
                {projectList.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => setCurrentProjectId(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                <PlusIcon /> Create project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <FormField
            id="projectName"
            label="Name"
            value={name}
            onChange={setName}
            disabled={createProject.isLoading}
            autoFocus
          />
          <FormError
            message={
              createProject.error
                ? errorMessage(createProject.error, 'Could not create project')
                : null
            }
          />
          <DialogFooter>
            <LoadingButton
              loading={createProject.isLoading}
              onClick={handleCreate}
              disabled={!name.trim()}
            >
              Create
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarHeader>
  );
}

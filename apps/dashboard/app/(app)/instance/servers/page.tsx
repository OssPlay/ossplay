'use client';

import { HardDriveIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Container from '@/components/ui/container';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingButton } from '@/components/ui/loading-button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAction } from '@/hooks/use-action';
import { ApiError, apiFetch, errorMessage } from '@/lib/api';

type ServerStatus = 'pending' | 'checking' | 'online' | 'offline' | 'error';

type RemoteServerRow = {
  id: string;
  label: string;
  host: string;
  port: number;
  sshUsername: string;
  sshKeyId: string;
  status: ServerStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type SshKeyOption = { id: string; label: string };

const STATUS_VARIANT: Record<ServerStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  checking: 'outline',
  online: 'secondary',
  offline: 'outline',
  error: 'destructive',
};

export default function InstanceServersPage() {
  const { data, error, mutate } = useSWR<{ servers: RemoteServerRow[] }>('/instance/servers');
  const { data: keysData } = useSWR<{ keys: SshKeyOption[] }>('/instance/ssh-keys');
  const [dialogOpen, setDialogOpen] = useState(false);
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  const servers = data?.servers ?? [];
  const sshKeys = keysData?.keys ?? [];

  return (
    <Container
      header={{
        icon: HardDriveIcon,
        title: 'Remote Servers',
        description: 'Register a VPS to run a worker container against.',
        action: { icon: PlusIcon, title: 'Add server', onClick: () => setDialogOpen(true) },
      }}
      size="lg"
    >
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No remote servers yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <RemoteServerRowItem key={server.id} server={server} onChange={() => mutate()} />
            ))}
          </TableBody>
        </Table>
      )}

      <AddServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sshKeys={sshKeys}
        onAdded={() => mutate()}
      />
    </Container>
  );
}

function RemoteServerRowItem({
  server,
  onChange,
}: {
  server: RemoteServerRow;
  onChange: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const test = useAction(
    () => apiFetch(`/instance/servers/${server.id}/test`, { method: 'POST' }),
    { error: 'Could not test connection' },
  );
  const remove = useAction(() => apiFetch(`/instance/servers/${server.id}`, { method: 'DELETE' }), {
    error: 'Could not remove server',
  });

  async function handleTest() {
    await test
      .trigger()
      .then(onChange)
      .catch(() => {});
  }

  async function handleRemove() {
    await remove
      .trigger()
      .then(() => {
        setDeleteOpen(false);
        onChange();
      })
      .catch(() => {});
  }

  return (
    <TableRow>
      <TableCell>{server.label}</TableCell>
      <TableCell className="text-muted-foreground">
        {server.sshUsername}@{server.host}:{server.port}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[server.status]} className="w-fit capitalize">
            {server.status}
          </Badge>
          {server.status === 'error' && server.lastError && (
            <span className="text-xs text-muted-foreground">{server.lastError}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {server.lastCheckedAt ? new Date(server.lastCheckedAt).toLocaleString() : 'Never'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <LoadingButton
            variant="secondary"
            size="sm"
            loading={test.isLoading}
            onClick={handleTest}
          >
            Test
          </LoadingButton>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-block">
                  <Button variant="secondary" size="sm" disabled>
                    Provision worker
                  </Button>
                </span>
              }
            />
            <TooltipContent>
              Coming soon — needs a dedicated worker image that hasn't shipped yet.
            </TooltipContent>
          </Tooltip>
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger
              render={
                <Button variant="secondary" size="sm">
                  Remove
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove "{server.label}"?</AlertDialogTitle>
                <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={remove.isLoading}
                  onClick={handleRemove}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AddServerDialog({
  open,
  onOpenChange,
  sshKeys,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sshKeys: SshKeyOption[];
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [sshUsername, setSshUsername] = useState('root');
  const [sshKeyId, setSshKeyId] = useState('');

  const create = useAction(
    () =>
      apiFetch('/instance/servers', {
        method: 'POST',
        body: JSON.stringify({
          label,
          host,
          port: Number(port),
          sshUsername,
          sshKeyId,
        }),
      }),
    { error: 'Could not add server' },
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setLabel('');
      setHost('');
      setPort('22');
      setSshUsername('root');
      setSshKeyId(sshKeys[0]?.id ?? '');
      create.reset();
    }
    onOpenChange(next);
  }

  async function handleCreate() {
    await create
      .trigger()
      .then(() => {
        onOpenChange(false);
        onAdded();
      })
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add remote server</DialogTitle>
        </DialogHeader>
        {sshKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add an SSH key first — a remote server needs one to connect with.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <FormField
              id="serverLabel"
              label="Label"
              value={label}
              onChange={setLabel}
              autoComplete="off"
              autoFocus
              disabled={create.isLoading}
            />
            <div className="flex gap-4 flex-nowrap">
              <FormField
                id="serverHost"
                label="Host"
                value={host}
                onChange={setHost}
                autoComplete="off"
                disabled={create.isLoading}
              />
              <FormField
                id="serverPort"
                label="Port"
                value={port}
                onChange={setPort}
                autoComplete="off"
                type="number"
                disabled={create.isLoading}
              />
            </div>
            <FormField
              id="serverSshUsername"
              label="SSH username"
              value={sshUsername}
              onChange={setSshUsername}
              autoComplete="off"
              disabled={create.isLoading}
            />
            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-base font-medium text-foreground">SSH key</span>
              <Select
                value={sshKeyId}
                onValueChange={(value) => setSshKeyId(value ?? '')}
                disabled={create.isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sshKeys.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormError
              message={create.error ? errorMessage(create.error, 'Could not add server') : null}
            />
          </div>
        )}
        <DialogFooter>
          <LoadingButton
            loading={create.isLoading}
            onClick={handleCreate}
            disabled={sshKeys.length === 0 || !label || !host || !port || !sshUsername || !sshKeyId}
          >
            Add server
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

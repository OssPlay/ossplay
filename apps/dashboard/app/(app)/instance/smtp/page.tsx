'use client';

import { MailIcon, PlusIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
import { useAuth } from '@/components/providers/auth-provider';
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
import { Label } from '@/components/ui/label';
import { LoadingButton } from '@/components/ui/loading-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAction } from '@/hooks/use-action';
import { ApiError, apiFetch, errorMessage } from '@/lib/api';

type SmtpConfigRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  fromAddress: string;
  fromName: string | null;
  isDefault: boolean;
};

export default function InstanceSmtpPage() {
  const { data, error, mutate } = useSWR<{ configs: SmtpConfigRow[] }>('/instance/smtp');
  const [dialogOpen, setDialogOpen] = useState(false);
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  const configs = data?.configs ?? [];

  return (
    <Container
      header={{
        icon: MailIcon,
        title: 'Email & SMTP',
        description: 'Used to send invitation and password-reset emails.',
        action: {
          icon: PlusIcon,
          title: 'Add config',
          onClick: () => setDialogOpen(true),
        },
      }}
      size="lg"
    >
      {configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SMTP configs yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Default</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <SmtpConfigRowItem key={config.id} config={config} onChange={() => mutate()} />
            ))}
          </TableBody>
        </Table>
      )}

      <AddSmtpConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={() => mutate()}
      />
    </Container>
  );
}

function SmtpConfigRowItem({ config, onChange }: { config: SmtpConfigRow; onChange: () => void }) {
  const makeDefault = useAction(
    () => apiFetch(`/instance/smtp/${config.id}/default`, { method: 'PUT' }),
    { error: 'Could not set as default' },
  );
  const remove = useAction(() => apiFetch(`/instance/smtp/${config.id}`, { method: 'DELETE' }), {
    error: 'Could not delete config',
  });

  async function handleRemove() {
    await remove
      .trigger()
      .then(onChange)
      .catch(() => {});
  }

  return (
    <TableRow>
      <TableCell>{config.name}</TableCell>
      <TableCell className="text-muted-foreground">{config.host}</TableCell>
      <TableCell className="text-muted-foreground">
        {config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress}
      </TableCell>
      <TableCell>
        {config.isDefault ? (
          <Badge variant="secondary">Default</Badge>
        ) : (
          <LoadingButton
            variant="secondary"
            size="sm"
            loading={makeDefault.isLoading}
            onClick={() =>
              makeDefault
                .trigger()
                .then(onChange)
                .catch(() => {})
            }
          >
            Make default
          </LoadingButton>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <TestSmtpConfigButton configId={config.id} configName={config.name} />
          <DeleteSmtpConfigButton
            configName={config.name}
            loading={remove.isLoading}
            onConfirm={handleRemove}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function DeleteSmtpConfigButton({
  configName,
  loading,
  onConfirm,
}: {
  configName: string;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="secondary" size="sm">
            Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{configName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This SMTP config will stop being usable immediately. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={loading} onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TestSmtpConfigButton({ configId, configName }: { configId: string; configName: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(user.email);

  const test = useAction(
    () =>
      apiFetch(`/instance/smtp/${configId}/test`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      }),
    { error: 'Could not send test email', success: 'Test email sent' },
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTo(user.email);
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="secondary" size="sm">
            Test
          </Button>
        }
      />
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-3">
          <FormField
            id={`smtpTestTo-${configId}`}
            label="Send test email to"
            type="email"
            value={to}
            onChange={setTo}
            autoComplete="email"
            autoFocus
            disabled={test.isLoading}
          />
          <LoadingButton
            size="sm"
            loading={test.isLoading}
            disabled={!to}
            onClick={() =>
              test
                .trigger()
                .then(() => setOpen(false))
                .catch(() => {})
            }
          >
            <SendIcon /> Send from "{configName}"
          </LoadingButton>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddSmtpConfigDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [secure, setSecure] = useState(true);

  const create = useAction(
    () =>
      apiFetch('/instance/smtp', {
        method: 'POST',
        body: JSON.stringify({
          name,
          host,
          port: Number(port),
          username: username || null,
          password: password || null,
          fromAddress,
          fromName: fromName || null,
          secure,
        }),
      }),
    { error: 'Could not create SMTP config' },
  );

  async function handleCreate() {
    await create
      .trigger()
      .then(() => {
        setName('');
        setHost('');
        setPort('');
        setUsername('');
        setPassword('');
        setFromAddress('');
        setFromName('');
        setSecure(true);
        onOpenChange(false);
        onAdded();
      })
      .catch(() => {});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add SMTP config</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField
            id="smtpName"
            label="Name"
            value={name}
            onChange={setName}
            autoComplete="off"
            autoFocus
            disabled={create.isLoading}
          />
          <div className="flex gap-4 flex-nowrap">
            <FormField
              id="smtpHost"
              label="Host"
              value={host}
              onChange={setHost}
              autoComplete="off"
              disabled={create.isLoading}
            />
            <FormField
              id="smtpPort"
              label="Port"
              value={port}
              onChange={setPort}
              autoComplete="off"
              disabled={create.isLoading}
              type="number"
            />
          </div>
          <FormField
            id="smtpUsername"
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="off"
            disabled={create.isLoading}
          />
          <FormField
            id="smtpPassword"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={create.isLoading}
          />
          <div className="flex gap-4 flex-nowrap">
            <FormField
              id="smtpFromName"
              label="From name"
              value={fromName}
              onChange={setFromName}
              autoComplete="off"
              disabled={create.isLoading}
            />
            <FormField
              id="smtpFromAddress"
              label="From address"
              type="email"
              value={fromAddress}
              onChange={setFromAddress}
              autoComplete="off"
              disabled={create.isLoading}
            />
          </div>
          <FormError
            message={
              create.error ? errorMessage(create.error, 'Could not create SMTP config') : null
            }
          />
        </div>
        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="smtpSecure"
              checked={secure}
              onCheckedChange={setSecure}
              disabled={create.isLoading}
            />
            <Label htmlFor="smtpSecure">Use TLS</Label>
          </div>
          <LoadingButton
            loading={create.isLoading}
            onClick={handleCreate}
            disabled={!name || !host || !port || !fromAddress}
          >
            Create
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

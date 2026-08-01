'use client';

import { MailIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { FormField } from '@/components/auth/form-field';
import { FormError } from '@/components/form-error';
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
        action: { icon: PlusIcon, title: 'Add config', onClick: () => setDialogOpen(true) },
      }}
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const test = useAction(() => apiFetch(`/instance/smtp/${config.id}/test`, { method: 'POST' }), {
    error: 'Could not send test email',
    success: 'Test email sent',
  });
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
            variant="ghost"
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
          <LoadingButton
            variant="ghost"
            size="sm"
            loading={test.isLoading}
            onClick={() => test.trigger()}
          >
            Test
          </LoadingButton>
          {confirmingDelete ? (
            <>
              <LoadingButton
                variant="destructive"
                size="sm"
                loading={remove.isLoading}
                onClick={handleRemove}
              >
                Confirm
              </LoadingButton>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={remove.isLoading}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add SMTP config</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField
            id="smtpName"
            label="Name"
            value={name}
            onChange={setName}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpHost"
            label="Host"
            value={host}
            onChange={setHost}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpPort"
            label="Port"
            value={port}
            onChange={setPort}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpUsername"
            label="Username"
            value={username}
            onChange={setUsername}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpPassword"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpFromAddress"
            label="From address"
            type="email"
            value={fromAddress}
            onChange={setFromAddress}
            disabled={create.isLoading}
          />
          <FormField
            id="smtpFromName"
            label="From name"
            value={fromName}
            onChange={setFromName}
            disabled={create.isLoading}
          />
          <div className="flex items-center gap-2">
            <Switch
              id="smtpSecure"
              checked={secure}
              onCheckedChange={setSecure}
              disabled={create.isLoading}
            />
            <Label htmlFor="smtpSecure">Use TLS</Label>
          </div>
          <FormError
            message={
              create.error ? errorMessage(create.error, 'Could not create SMTP config') : null
            }
          />
        </div>
        <DialogFooter>
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

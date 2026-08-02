'use client';

import { CopyIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAction } from '@/hooks/use-action';
import { ApiError, apiFetch, errorMessage } from '@/lib/api';

type SshKeyRow = {
  id: string;
  label: string;
  publicKey: string;
  fingerprint: string;
  serverCount: number;
  createdAt: string;
};

export default function InstanceSshKeysPage() {
  const { data, error, mutate } = useSWR<{ keys: SshKeyRow[] }>('/instance/ssh-keys');
  const [dialogOpen, setDialogOpen] = useState(false);
  const forbidden = error instanceof ApiError && error.status === 403;

  if (forbidden) {
    return (
      <p className="text-sm text-muted-foreground">Only the instance root can view this page.</p>
    );
  }

  const keys = data?.keys ?? [];

  return (
    <Container
      header={{
        icon: KeyRoundIcon,
        title: 'SSH Keys',
        description: 'Keypairs used to connect to your remote servers.',
        action: { icon: PlusIcon, title: 'Add key', onClick: () => setDialogOpen(true) },
      }}
      size="lg"
    >
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SSH keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Fingerprint</TableHead>
              <TableHead>Servers</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <SshKeyRowItem key={key.id} sshKey={key} onChange={() => mutate()} />
            ))}
          </TableBody>
        </Table>
      )}

      <AddSshKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={() => mutate()} />
    </Container>
  );
}

function SshKeyRowItem({ sshKey, onChange }: { sshKey: SshKeyRow; onChange: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useAction(
    () => apiFetch(`/instance/ssh-keys/${sshKey.id}`, { method: 'DELETE' }),
    { error: 'Could not delete key' },
  );

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
      <TableCell>{sshKey.label}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {sshKey.fingerprint}
      </TableCell>
      <TableCell className="text-muted-foreground">{sshKey.serverCount}</TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(sshKey.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogTrigger
            render={
              <Button variant="secondary" size="sm">
                Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{sshKey.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {sshKey.serverCount > 0
                  ? "This key is used by a remote server and can't be deleted until that server is removed."
                  : "This can't be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={remove.isLoading || sshKey.serverCount > 0}
                onClick={handleRemove}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

function AddSshKeyDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<'generate' | 'paste'>('generate');
  const [label, setLabel] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [createdPublicKey, setCreatedPublicKey] = useState<string | null>(null);

  const create = useAction(
    () =>
      apiFetch<{ key: { publicKey: string } }>('/instance/ssh-keys', {
        method: 'POST',
        body: JSON.stringify(mode === 'generate' ? { mode, label } : { mode, label, privateKey }),
      }),
    { error: 'Could not add key' },
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setMode('generate');
      setLabel('');
      setPrivateKey('');
      setCreatedPublicKey(null);
      create.reset();
    }
    onOpenChange(next);
  }

  async function handleCreate() {
    await create
      .trigger()
      .then((res) => {
        setCreatedPublicKey(res.key.publicKey);
        onAdded();
      })
      .catch(() => {});
  }

  function copyPublicKey() {
    if (!createdPublicKey) return;
    navigator.clipboard.writeText(createdPublicKey);
    toast.success('Copied to clipboard');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add SSH key</DialogTitle>
        </DialogHeader>
        {createdPublicKey ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Copy this into the target server's <code>~/.ssh/authorized_keys</code>. The private
              key is encrypted at rest and won't be shown again.
            </p>
            <div className="relative">
              <Textarea
                readOnly
                value={createdPublicKey}
                rows={3}
                className="font-mono text-xs pr-10"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute top-2 right-2"
                onClick={copyPublicKey}
                aria-label="Copy public key"
              >
                <CopyIcon />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'generate' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setMode('generate')}
              >
                Generate
              </Button>
              <Button
                type="button"
                variant={mode === 'paste' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => setMode('paste')}
              >
                Paste existing
              </Button>
            </div>
            <FormField
              id="sshKeyLabel"
              label="Label"
              value={label}
              onChange={setLabel}
              autoComplete="off"
              autoFocus
              disabled={create.isLoading}
            />
            {mode === 'paste' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sshKeyPrivateKey">Private key (PEM)</Label>
                <Textarea
                  id="sshKeyPrivateKey"
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  disabled={create.isLoading}
                />
              </div>
            )}
            <FormError
              message={create.error ? errorMessage(create.error, 'Could not add key') : null}
            />
            <DialogFooter>
              <LoadingButton
                loading={create.isLoading}
                onClick={handleCreate}
                disabled={!label || (mode === 'paste' && !privateKey)}
              >
                {mode === 'generate' ? 'Generate key' : 'Add key'}
              </LoadingButton>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

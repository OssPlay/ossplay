"use client";

import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { CopyableLink } from "@/components/copyable-link";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Container from "@/components/ui/container";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAction } from "@/hooks/use-action";
import { useDialogForm } from "@/hooks/use-dialog-form";
import { useProjectDetail } from "@/hooks/use-project-detail";
import { apiFetch, errorMessage } from "@/lib/api";
import { formatDatetime } from "@/lib/utils";
import type { ProjectApiKeyRow } from "@/types/projects";

// A project's own API keys — small, bounded, single-entity list (per
// DESIGN.md §4's embedded-table exception), not a DataTable-shell page.
// Same sensitivity tier as Danger Zone (a key grants full read/write on the
// project's files), so this stays under project settings' "Settings" group
// rather than being its own top-level nav item.
export default function ProjectApiKeysPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const { org, effectiveOrgId } = useProjectDetail(projectId);

	const { data, mutate } = useSWR<{ keys: ProjectApiKeyRow[] }>(
		effectiveOrgId ? `/organizations/${effectiveOrgId}/projects/${projectId}/api-keys` : null,
	);
	const keys = data?.keys ?? [];
	const canManage = org?.role !== "member";

	const [createOpen, setCreateOpen] = useState(false);

	if (!canManage) return null;

	return (
		<Container
			header={{
				icon: KeyRoundIcon,
				title: "API Keys",
				description:
					"Project-scoped keys for the public consumer API — full read/write on this project's files.",
				action: { icon: PlusIcon, title: "New key", onClick: () => setCreateOpen(true) },
			}}
			size="sm"
		>
			<div className="flex flex-col gap-4">
				{keys.length > 0 && (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Label</TableHead>
								<TableHead>Key</TableHead>
								<TableHead>Last used</TableHead>
								<TableHead>Created</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{keys.map((key) => (
								<ApiKeyRow
									key={key.id}
									apiKey={key}
									orgId={effectiveOrgId}
									projectId={projectId}
									onRevoked={() => mutate()}
								/>
							))}
						</TableBody>
					</Table>
				)}
				{keys.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No API keys yet — create one to use the /v1 API or the SDK/CLI against this project.
					</p>
				)}
			</div>

			<CreateApiKeyDialog
				orgId={effectiveOrgId}
				projectId={projectId}
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={() => mutate()}
			/>
		</Container>
	);
}

function ApiKeyRow({
	apiKey,
	orgId,
	projectId,
	onRevoked,
}: {
	apiKey: ProjectApiKeyRow;
	orgId: string | null;
	projectId: string;
	onRevoked: () => void;
}) {
	const revoke = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/projects/${projectId}/api-keys/${apiKey.id}`, {
				method: "DELETE",
			}),
		{ success: `"${apiKey.label}" revoked`, error: "Could not revoke key" },
	);

	return (
		<TableRow>
			<TableCell className="font-medium">{apiKey.label}</TableCell>
			<TableCell className="font-mono text-xs text-muted-foreground">{apiKey.keyPrefix}…</TableCell>
			<TableCell className="text-muted-foreground">
				{apiKey.lastUsedAt ? formatDatetime(apiKey.lastUsedAt) : "Never"}
			</TableCell>
			<TableCell className="text-muted-foreground">{formatDatetime(apiKey.createdAt)}</TableCell>
			<TableCell className="text-right">
				{apiKey.revokedAt ? (
					<Badge variant="outline">Revoked</Badge>
				) : (
					<ConfirmDialog
						trigger={
							<Button variant="destructive" size="sm">
								Revoke
							</Button>
						}
						title={`Revoke "${apiKey.label}"?`}
						description="Any app using this key immediately loses access to this project. This can't be undone."
						confirmLabel="Revoke"
						loading={revoke.isLoading}
						onConfirm={() => revoke.trigger().then(onRevoked)}
					/>
				)}
			</TableCell>
		</TableRow>
	);
}

function CreateApiKeyDialog({
	orgId,
	projectId,
	open,
	onOpenChange,
	onCreated,
}: {
	orgId: string | null;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const [label, setLabel] = useState("");
	const [secret, setSecret] = useState<string | null>(null);

	const create = useAction(
		() =>
			apiFetch<{ secret: string }>(`/organizations/${orgId}/projects/${projectId}/api-keys`, {
				method: "POST",
				body: JSON.stringify({ label }),
			}),
		{ error: "Could not create API key" },
	);

	// Custom submit (not useDialogForm's handleSubmit) — success here reveals
	// the secret in place rather than closing the dialog, so only the reset-
	// on-close half of useDialogForm applies.
	const { handleOpenChange } = useDialogForm({
		onOpenChange,
		resetFields: () => {
			setLabel("");
			setSecret(null);
		},
		action: create,
	});

	function handleCreate() {
		create
			.trigger()
			.then((res) => {
				setSecret(res.secret);
				onCreated();
			})
			.catch(() => {});
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{secret ? "Copy your API key" : "New API key"}</DialogTitle>
				</DialogHeader>
				{secret ? (
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							This is the only time the full key is shown — store it somewhere safe, it can't be
							retrieved again. If it's lost, revoke it and create a new one.
						</p>
						<CopyableLink url={secret} />
						<DialogFooter>
							<Button onClick={() => handleOpenChange(false)}>Done</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<FormField
							id="apiKeyLabel"
							label="Label"
							value={label}
							onChange={setLabel}
							placeholder="e.g. Production website"
							autoFocus
							disabled={create.isLoading}
						/>
						<FormError
							message={create.error ? errorMessage(create.error, "Could not create API key") : null}
						/>
						<DialogFooter>
							<LoadingButton
								loading={create.isLoading}
								onClick={handleCreate}
								disabled={!label.trim()}
							>
								Create
							</LoadingButton>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

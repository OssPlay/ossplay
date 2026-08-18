"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { DatabaseIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { useAuth } from "@/components/providers/auth-provider";
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
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { useDialogForm } from "@/hooks/use-dialog-form";
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useOrgSectionId } from "@/lib/current-org";
import type { ConfigStatus, DestinationRow, DestinationStatus } from "@/types/instance";
import type { Visibility } from "@/types/projects";

interface DestinationsResponse {
	destinations: DestinationRow[];
	total: number;
	page: number;
	pageSize: number;
}

const STATUS_VARIANT: Record<
	DestinationStatus,
	"default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
	untested: "outline",
	ok: "success",
	error: "destructive",
};

const CONFIG_STATUS_VARIANT: Record<
	ConfigStatus,
	"default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
	unconfigured: "outline",
	configured: "success",
	drifted: "warning",
	error: "destructive",
};

// Org-scoped storage destinations — see s3-destinations.ts's Dockerfile
// comment for why bucket is fixed at creation (Bun's native S3Client has no
// account-level "list my buckets" call, only ListObjectsV2 within a bucket
// you already know), so a destination is one bucket, not an account.
export default function OrganizationDestinationsPage() {
	const { organizations, user, instance } = useAuth();
	const orgId = useOrgSectionId();
	const membershipOrg = organizations.find((o) => o.id === orgId);
	const hasMembership = Boolean(membershipOrg);

	const { error: orgError, isLoading: orgLoading } = useSWR<{ organization: { id: string } }>(
		!hasMembership && orgId ? `/organizations/${orgId}` : null,
	);

	const table = useServerTable<DestinationsResponse, DestinationRow>({
		endpoint: orgId ? `/organizations/${orgId}/s3-destinations` : null,
		items: (response) => response.destinations,
	});
	const [dialogOpen, setDialogOpen] = useState(false);
	const deleteMany = useAction((ids: string[]) =>
		Promise.allSettled(
			ids.map((id) =>
				apiFetch(`/organizations/${orgId}/s3-destinations/${id}`, { method: "DELETE" }),
			),
		),
	);

	if (!orgId) return null;

	if (!hasMembership && orgError instanceof ApiError && orgError.status === 404) {
		return <p className="text-sm text-muted-foreground">Organization not found.</p>;
	}

	// org:manage_settings is owner-only — see permissions.ts. Credential
	// storage warrants the tightest org-level gate, same as org rename/delete.
	const canManage = user.instanceRole === "root" || membershipOrg?.role === "owner";
	if (!canManage) {
		return (
			<p className="text-sm text-muted-foreground">
				Only an organization owner can manage S3 destinations.
			</p>
		);
	}

	async function handleBulkDelete(selected: DestinationRow[]) {
		const results = await deleteMany.trigger(selected.map((d) => d.id));
		const failedCount = results.filter((result) => result.status === "rejected").length;
		const successCount = selected.length - failedCount;
		if (failedCount > 0) {
			toast.error(
				failedCount === selected.length
					? "Could not delete the selected destinations — they may still be used by a project."
					: `Deleted ${successCount} of ${selected.length} destinations — the rest may still be used by a project.`,
			);
		} else {
			toast.success(
				successCount === 1 ? "1 destination deleted" : `${successCount} destinations deleted`,
			);
		}
		table.mutate();
	}

	const columns: DataTableColumn<DestinationRow>[] = [
		{ key: "label", title: "Label", sortable: true },
		{
			key: "bucket",
			title: "Bucket",
			cell: (row) => (
				<span className="font-mono text-xs">
					{row.bucket} · {row.endpoint}
				</span>
			),
		},
		{
			key: "visibility",
			title: "Visibility",
			cell: (row) => (
				<Badge variant="outline" className="capitalize">
					{row.visibility}
				</Badge>
			),
		},
		{
			key: "status",
			title: "Connection",
			cell: (row) => (
				<div className="flex flex-col gap-1">
					<Badge variant={STATUS_VARIANT[row.status]} className="w-fit capitalize">
						{row.status}
					</Badge>
					{row.status === "error" && row.lastError && (
						<span className="text-xs text-muted-foreground">{row.lastError}</span>
					)}
				</div>
			),
		},
		{
			key: "configStatus",
			title: "Configuration",
			cell: (row) => (
				<div className="flex flex-col gap-1">
					<Badge variant={CONFIG_STATUS_VARIANT[row.configStatus]} className="w-fit capitalize">
						{row.configStatus}
					</Badge>
					{row.configError && (
						<span className="text-xs text-muted-foreground">{row.configError}</span>
					)}
				</div>
			),
		},
	];

	return (
		<ApiLoader isLoading={orgLoading}>
			<Container
				header={{
					icon: DatabaseIcon,
					title: "S3 Destinations",
					description:
						"Where this organization's projects store their files. A project with no destination assigned — or whose destination was deleted — automatically falls back to this instance's Local Drive, so it's never left without somewhere to store files.",
					action: { icon: PlusIcon, title: "Add destination", onClick: () => setDialogOpen(true) },
					learnMore: instance?.docsUrl
						? { href: `${instance.docsUrl}/guides/s3-destinations` }
						: undefined,
				}}
				size="lg"
			>
				<DataTable
					table={table}
					rowId={(row) => row.id}
					columns={columns}
					searchPlaceholder="Search by label or bucket…"
					emptyTitle="No S3 destinations yet"
					emptyDescription="Add one before creating a project — every project needs a destination."
					facets={[
						{
							key: "visibility",
							title: "Visibility",
							options: [
								{ label: "Public", value: "public" },
								{ label: "Private", value: "private" },
							],
						},
						{
							key: "status",
							title: "Connection",
							options: [
								{ label: "Untested", value: "untested" },
								{ label: "OK", value: "ok" },
								{ label: "Error", value: "error" },
							],
						},
						{
							key: "configStatus",
							title: "Configuration",
							options: [
								{ label: "Unconfigured", value: "unconfigured" },
								{ label: "Configured", value: "configured" },
								{ label: "Drifted", value: "drifted" },
								{ label: "Error", value: "error" },
							],
						},
					]}
					bulkActions={[
						{
							label: "Delete",
							variant: "destructive",
							onClick: handleBulkDelete,
							confirm: {
								title: "Delete selected destinations?",
								description: "This can't be undone.",
							},
						},
					]}
					rowActions={(row) => (
						<DestinationRowActions destination={row} onChange={() => table.mutate()} />
					)}
				/>

				<AddDestinationDialog
					orgId={orgId}
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					onAdded={() => table.mutate()}
				/>
			</Container>
		</ApiLoader>
	);
}

function DestinationRowActions({
	destination,
	onChange,
}: {
	destination: DestinationRow;
	onChange: () => void;
}) {
	const orgId = useOrgSectionId();

	const test = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/s3-destinations/${destination.id}/test`, {
				method: "POST",
			}),
		{ success: "Connection test triggered", error: "Could not test connection" },
	);
	const configure = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/s3-destinations/${destination.id}/configure`, {
				method: "POST",
			}),
		{ success: "Configuration applied", error: "Could not apply configuration" },
	);
	const remove = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/s3-destinations/${destination.id}`, {
				method: "DELETE",
			}),
		{ success: `"${destination.label}" removed`, error: "Could not remove destination" },
	);

	async function handleTest() {
		await test
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

	async function handleConfigure() {
		await configure
			.trigger()
			.then(onChange)
			.catch(() => {});
	}

	return (
		<div className="flex justify-end gap-2">
			<LoadingButton variant="secondary" size="sm" loading={test.isLoading} onClick={handleTest}>
				Test
			</LoadingButton>
			<LoadingButton
				variant="secondary"
				size="sm"
				loading={configure.isLoading}
				onClick={handleConfigure}
			>
				Configure
			</LoadingButton>
			<ConfirmDialog
				trigger={
					<Button variant="secondary" size="sm">
						Remove
					</Button>
				}
				title={`Remove "${destination.label}"?`}
				description="This can't be undone. Blocked while any project still points at it."
				loading={remove.isLoading}
				onConfirm={() => remove.trigger().then(onChange)}
			/>
		</div>
	);
}

function AddDestinationDialog({
	orgId,
	open,
	onOpenChange,
	onAdded,
}: {
	orgId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: () => void;
}) {
	const [label, setLabel] = useState("");
	const [endpoint, setEndpoint] = useState("");
	const [endpointTouched, setEndpointTouched] = useState(false);
	const [region, setRegion] = useState("");
	const [bucket, setBucket] = useState("");
	const [accessKeyId, setAccessKeyId] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");
	const [visibility, setVisibility] = useState<Visibility>("private");
	const [cloudfrontUrl, setCloudfrontUrl] = useState("");

	const create = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/s3-destinations`, {
				method: "POST",
				body: JSON.stringify({
					label,
					endpoint,
					region,
					bucket,
					accessKeyId,
					secretAccessKey,
					visibility,
					cloudfrontUrl: cloudfrontUrl || undefined,
				}),
			}),
		{ success: "Destination added", error: "Could not add destination" },
	);

	const { handleOpenChange, handleSubmit } = useDialogForm({
		onOpenChange,
		resetFields: () => {
			setLabel("");
			setEndpoint("");
			setEndpointTouched(false);
			setRegion("");
			setBucket("");
			setAccessKeyId("");
			setSecretAccessKey("");
			setVisibility("private");
			setCloudfrontUrl("");
		},
		action: create,
	});

	// Same seed-once-then-freely-editable pattern as CreateProjectDialog's
	// name→id slugify: suggest AWS's standard regional endpoint as soon as a
	// region is typed, but stop touching it the moment the user edits it
	// directly (an S3-compatible provider like MinIO/R2/Spaces needs its own
	// endpoint, not this default).
	function handleRegionChange(next: string) {
		setRegion(next);
		if (!endpointTouched) setEndpoint(next ? `https://s3.${next}.amazonaws.com` : "");
	}

	function handleEndpointChange(next: string) {
		setEndpointTouched(true);
		setEndpoint(next);
	}

	function handleCreate() {
		return handleSubmit(() => create.trigger(), onAdded);
	}

	const canSubmit = label && endpoint && region && bucket && accessKeyId && secretAccessKey;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Add S3 destination</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<FormField
						id="destinationLabel"
						label="Label"
						value={label}
						onChange={setLabel}
						autoComplete="off"
						autoFocus
						disabled={create.isLoading}
					/>
					<FormField
						id="destinationEndpoint"
						label="Endpoint"
						value={endpoint}
						onChange={handleEndpointChange}
						placeholder="https://s3.us-east-1.amazonaws.com"
						autoComplete="off"
						disabled={create.isLoading}
						helpText="Auto-filled from region for AWS — edit directly for MinIO, R2, Spaces, etc."
					/>
					<div className="flex gap-4 flex-nowrap">
						<FormField
							id="destinationRegion"
							label="Region"
							value={region}
							onChange={handleRegionChange}
							placeholder="us-east-1"
							autoComplete="off"
							disabled={create.isLoading}
						/>
						<FormField
							id="destinationBucket"
							label="Bucket"
							value={bucket}
							onChange={setBucket}
							autoComplete="off"
							disabled={create.isLoading}
						/>
					</div>
					<FormField
						id="destinationAccessKeyId"
						label="Access key ID"
						value={accessKeyId}
						onChange={setAccessKeyId}
						autoComplete="off"
						disabled={create.isLoading}
					/>
					<FormField
						id="destinationSecretAccessKey"
						label="Secret access key"
						type="password"
						value={secretAccessKey}
						onChange={setSecretAccessKey}
						autoComplete="off"
						disabled={create.isLoading}
					/>
					<div className="flex flex-col gap-1.5 w-full">
						<Label htmlFor="destinationVisibility">Visibility</Label>
						<Select
							value={visibility}
							onValueChange={(value) => {
								if (value) setVisibility(value as Visibility);
							}}
							disabled={create.isLoading}
						>
							<SelectTrigger id="destinationVisibility" className="w-full">
								<SelectValue items={{ private: "Private", public: "Public" }} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="private">Private</SelectItem>
								<SelectItem value="public">Public</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Fixed once created — a project can only point at a destination matching its own
							visibility.
						</p>
					</div>
					{visibility === "public" && (
						<FormField
							id="destinationCloudfrontUrl"
							label="CloudFront URL (optional)"
							value={cloudfrontUrl}
							onChange={setCloudfrontUrl}
							autoComplete="off"
							disabled={create.isLoading}
						/>
					)}
					<FormError
						message={create.error ? errorMessage(create.error, "Could not add destination") : null}
					/>
				</div>
				<DialogFooter>
					<LoadingButton loading={create.isLoading} onClick={handleCreate} disabled={!canSubmit}>
						Add destination
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

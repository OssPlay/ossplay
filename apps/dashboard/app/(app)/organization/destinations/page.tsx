"use client";

// This page reads search params at runtime (useServerTable / useSearchParams) —
// opt out of static prerendering so Next.js does not attempt it at build time.
export const dynamic = "force-dynamic";

import { DatabaseIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { DataTable, type DataTableColumn } from "@/components/layout/data-table";
import { useAuth } from "@/components/providers/auth-provider";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useServerTable } from "@/hooks/use-server-table";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useOrgSectionId } from "@/lib/current-org";

type Visibility = "public" | "private";
type DestinationStatus = "untested" | "ok" | "error";

interface DestinationRow {
	id: string;
	label: string;
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	visibility: Visibility;
	cloudfrontUrl: string | null;
	status: DestinationStatus;
	lastCheckedAt: string | null;
	lastError: string | null;
	createdAt: string;
}

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

// Org-scoped storage destinations — see s3-destinations.ts's Dockerfile
// comment for why bucket is fixed at creation (Bun's native S3Client has no
// account-level "list my buckets" call, only ListObjectsV2 within a bucket
// you already know), so a destination is one bucket, not an account.
export default function OrganizationDestinationsPage() {
	const { organizations, user } = useAuth();
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

	const columns: DataTableColumn<DestinationRow>[] = [
		{ key: "label", title: "Label" },
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
			title: "Status",
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
	];

	return (
		<ApiLoader isLoading={orgLoading}>
			<Container
				header={{
					icon: DatabaseIcon,
					title: "S3 Destinations",
					description: "Where this organization's projects store their files.",
					action: { icon: PlusIcon, title: "Add destination", onClick: () => setDialogOpen(true) },
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
							title: "Status",
							options: [
								{ label: "Untested", value: "untested" },
								{ label: "OK", value: "ok" },
								{ label: "Error", value: "error" },
							],
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
	const [deleteOpen, setDeleteOpen] = useState(false);

	const test = useAction(
		() =>
			apiFetch(`/organizations/${orgId}/s3-destinations/${destination.id}/test`, {
				method: "POST",
			}),
		{ success: "Connection test triggered", error: "Could not test connection" },
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
		<div className="flex justify-end gap-2">
			<LoadingButton variant="secondary" size="sm" loading={test.isLoading} onClick={handleTest}>
				Test
			</LoadingButton>
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogTrigger render={<Button variant="secondary" size="sm" />}>
					Remove
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove "{destination.label}"?</AlertDialogTitle>
						<AlertDialogDescription>
							This can't be undone. Blocked while any project still points at it.
						</AlertDialogDescription>
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

	// Reset on close, not open: the header's "Add destination" button sets
	// `open` directly (bypassing this handler entirely, see the Container
	// header action below), so a reset-on-open branch never actually runs on
	// that path — the dialog would reopen still showing the previous
	// destination's values. Every close path (Escape, overlay click, a
	// successful submit) does go through this handler, so resetting here
	// covers all of them regardless of how it opened. Same fix as
	// instance/users/page.tsx's InviteUserDialog.
	function handleOpenChange(next: boolean) {
		if (!next) {
			setLabel("");
			setEndpoint("");
			setEndpointTouched(false);
			setRegion("");
			setBucket("");
			setAccessKeyId("");
			setSecretAccessKey("");
			setVisibility("private");
			setCloudfrontUrl("");
			create.reset();
		}
		onOpenChange(next);
	}

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

	async function handleCreate() {
		await create
			.trigger()
			.then(() => {
				handleOpenChange(false);
				onAdded();
			})
			.catch(() => {});
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

"use client";

import {
	CheckIcon,
	CopyIcon,
	IdCardIcon,
	RefreshCcwIcon,
	RefreshCwIcon,
	RssIcon,
	ServerIcon,
} from "lucide-react";
import { useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { FormField } from "@/components/auth/form-field";
import { FormError } from "@/components/form-error";
import ApiLoader from "@/components/layout/api-loader";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch, errorMessage } from "@/lib/api";
import { openUpdateDialog } from "@/lib/update-dialog-store";
import { formatDatetime } from "@/lib/utils";

type OverviewResponse = {
	serverIp: string | null;
	version: string;
	instanceName: string | null;
	updates: {
		autoCheck: boolean;
		lastCheckedAt: string | null;
		lastCheckResult: {
			available: boolean;
			latestVersion: string | null;
			forced: boolean;
		} | null;
	};
	os: {
		name: string;
		freeMem: number;
		totalMem: number;
		arch: string;
		machine: string;
		platform: string;
		release: string;
		uptime: number;
	};
};

function InfoRow({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		void navigator.clipboard.writeText(value).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<div className="flex items-center justify-between py-2 text-sm gap-x-3 border-b border-border/40 last:border-0">
			<span className="text-muted-foreground shrink-0">{label}</span>
			<span className="flex-1 border border-dashed border-border/30" />
			<span className="font-mono text-xs">{value}</span>
			<Tippy content={copied ? "Copied!" : "Copy"}>
				<Button
					size="icon-sm"
					variant={copied ? "default" : "ghost"}
					onClick={handleCopy}
					aria-label={`Copy ${label}`}
				>
					{copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
				</Button>
			</Tippy>
		</div>
	);
}

function InfoSection({ title }: { title: string }) {
	return (
		<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-6 mb-1 first:mt-0">
			{title}
		</p>
	);
}

function bytesToGB(bytes: number = 0) {
	const gb = bytes / 1024 ** 3;
	return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatPlatform(platform: string) {
	switch (platform) {
		case "linux":
			return "Linux";
		case "darwin":
			return "macOS";
		case "win32":
			return "Windows";
		default:
			return platform;
	}
}

function formatUptime(uptime: number = 0) {
	const days = Math.floor(uptime / (24 * 3600));
	const hours = Math.floor((uptime % (24 * 3600)) / 3600);
	const minutes = Math.floor((uptime % 3600) / 60);
	const seconds = Math.floor(uptime % 60);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);

	return parts.join(" ");
}

export default function InstanceOverviewPage() {
	const { data, mutate, isLoading, error } = useSWR<OverviewResponse>("/instance/overview");

	return (
		<ApiLoader isLoading={isLoading} error={error}>
			<Container
				header={{
					icon: IdCardIcon,
					title: "Instance Info",
					description: "Your instance name — shown in invite emails sent from this instance.",
				}}
				size="sm"
			>
				<InstanceName instanceName={data?.instanceName ?? null} />
			</Container>
			<Container
				header={{
					icon: RssIcon,
					title: "Server Updates",
					description: "Check for new server updates and configure automatic update checks.",
				}}
				size="sm"
			>
				{data && <ServerUpdates data={data} mutate={mutate} />}
			</Container>

			<Container
				header={{
					icon: ServerIcon,
					title: "Web Server",
					description: "Server info and version details for this instance.",
					action: {
						icon: RefreshCcwIcon,
						variant: "outline",
						onClick: () => mutate(),
					},
				}}
				size="sm"
			>
				<ServerInfo data={data} />
			</Container>
		</ApiLoader>
	);
}

function InstanceName({ instanceName: initialName }: { instanceName: string | null }) {
	const { mutateInstance } = useAuth();
	const [instanceName, setInstanceName] = useState(initialName ?? "");

	const save = useAction(
		() =>
			apiFetch<{ instanceName: string }>("/instance/overview", {
				method: "PUT",
				body: JSON.stringify({
					instanceName: instanceName || null,
				}),
			}),
		{
			loading: "Updating server name",
			error: (err) => `${err}`,
			success: (res) => {
				mutateInstance();

				if (res.instanceName) {
					return `Instance name updated to "${res.instanceName}"`;
				} else {
					return "Instance name removed";
				}
			},
		},
	);

	async function performSave() {
		await save.trigger();
	}

	function handleSubmit() {
		void performSave();
	}

	return (
		<div className="flex flex-col gap-4">
			<FormField
				id="instanceName"
				label="Instance name"
				value={instanceName}
				onChange={setInstanceName}
				autoComplete="off"
				helpText="e.g. your company name"
				disabled={save.isLoading}
				placeholder="My OSSPlay Instance"
			/>
			<FormError
				message={save.error ? errorMessage(save.error, "Could not save instance name") : null}
			/>
			<LoadingButton
				type="button"
				loading={save.isLoading}
				onClick={handleSubmit}
				className="w-fit"
			>
				Save changes
			</LoadingButton>
		</div>
	);
}

function ServerUpdates({
	data,
	mutate,
}: {
	data: OverviewResponse;
	mutate: KeyedMutator<OverviewResponse>;
}) {
	const { mutateInstance } = useAuth();

	const checkUpdates = useAction(
		() =>
			apiFetch<{
				currentVersion: string;
				latestVersion: string | null;
				available: boolean;
				forced: boolean;
				reason?: string;
			}>("/instance/overview/updates", { method: "POST" }),
		{ error: "Could not check for updates" },
	);

	// The sidebar footer's "Update available" badge and the global update
	// dialog (components/providers/update-apply-dialog.tsx) both read from
	// the separate, session-level GET /instance check (see auth-provider.tsx)
	// rather than this page's own /instance/overview fetch — refresh that
	// shared cache too so a manual check here is immediately reflected
	// everywhere else, not just on this page. Also refresh this page's own
	// /instance/overview data (`mutate`, this component's prop) — the POST
	// itself now persists a fresh `updates.lastCheckedAt`/`lastCheckResult`
	// (see instance.overview.ts), but nothing re-fetched GET / to pick that
	// up, so the "Last check: …" line below never changed after a manual
	// click even though the check genuinely ran.
	async function handleCheck() {
		await checkUpdates
			.trigger()
			.then(() => Promise.all([mutateInstance(), mutate()]))
			.catch(() => {});
	}

	const toggleAutoCheck = useAction(
		(autoCheck: boolean) =>
			apiFetch<{ updates: OverviewResponse["updates"] }>("/instance/overview/updates", {
				method: "PUT",
				body: JSON.stringify({ autoCheck }),
			}),
		{
			success: (data) => {
				mutate();
				if (data.updates.autoCheck) {
					return "Auto check enabled";
				} else {
					return "Auto check disabled";
				}
			},
			error: "Could not save the setting",
			loading: "Updating auto check...",
		},
	);

	async function handleAutoCheckChange(autoCheck: boolean) {
		await toggleAutoCheck.trigger(autoCheck).catch(() => {});
	}

	const updateResult = checkUpdates.data;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3">
				<LoadingButton
					variant="secondary"
					className="w-fit"
					loading={checkUpdates.isLoading}
					onClick={handleCheck}
				>
					<RefreshCwIcon className="size-4" />
					Check for updates
				</LoadingButton>

				{updateResult?.available && (
					<Button className="w-fit" onClick={() => openUpdateDialog()}>
						Update now
					</Button>
				)}

				{updateResult && (
					<p
						className={`text-sm ${
							updateResult.reason
								? "text-muted-foreground"
								: updateResult.available
									? "text-amber-600 dark:text-amber-400"
									: "text-emerald-600 dark:text-emerald-400"
						}`}
					>
						{updateResult.reason
							? updateResult.reason
							: updateResult.available
								? `Update available: ${updateResult.latestVersion} (currently on ${updateResult.currentVersion}).`
								: `Up to date — running ${updateResult.currentVersion}.`}
					</p>
				)}
			</div>

			<div className="flex items-center gap-2.5">
				<Checkbox
					id="auto-check-updates"
					checked={data?.updates.autoCheck ?? false}
					disabled={!data || toggleAutoCheck.isLoading}
					onCheckedChange={(checked) => handleAutoCheckChange(checked === true)}
				/>
				<label htmlFor="auto-check-updates" className="text-sm cursor-pointer select-none">
					Automatically check for updates
				</label>
			</div>
			{data?.updates.lastCheckedAt && (
				<p className="text-xs text-muted-foreground">
					Last check:{" "}
					<span className="font-medium">{formatDatetime(data.updates.lastCheckedAt)}</span>
					{data.updates.lastCheckResult?.forced
						? " — flagged unsafe, update required."
						: data.updates.lastCheckResult?.available
							? ` — update available: ${data.updates.lastCheckResult.latestVersion}.`
							: " — up to date."}
				</p>
			)}
		</div>
	);
}

function ServerInfo({ data }: { data?: OverviewResponse }) {
	const usedMem = (data?.os?.totalMem ?? 0) - (data?.os?.freeMem ?? 0);
	const totalMem = data?.os?.totalMem ?? 0;
	const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

	return (
		<div>
			<InfoSection title="Server" />
			<InfoRow
				label="Server IP"
				value={data ? (data.serverIp ?? "Could not be determined") : "—"}
			/>
			<InfoRow label="Hostname" value={data?.os?.name ?? "—"} />

			<InfoSection title="Machine" />
			<InfoRow
				label="Platform"
				value={`${formatPlatform(data?.os?.platform ?? "—")} (${data?.os?.platform ?? "-"})`}
			/>
			<InfoRow
				label="Architecture"
				value={`${data?.os?.arch ?? "—"} / ${data?.os?.release ?? "-"}`}
			/>
			<InfoRow
				label="Memory"
				value={
					totalMem > 0
						? `${bytesToGB(usedMem)} used of ${bytesToGB(totalMem)} (${memPercent}%)`
						: "—"
				}
			/>
			<InfoRow label="Uptime" value={formatUptime(data?.os?.uptime)} />

			<InfoSection title="Version" />
			<InfoRow label="OSSPlay" value={data?.version ?? "—"} />
		</div>
	);
}

"use client";

import { CopyIcon, RefreshCcwIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import { formatDatetime } from "@/lib/utils";

type OverviewResponse = {
	serverIp: string | null;
	version: string;
	updates: {
		autoCheck: boolean;
		lastCheckedAt: string | null;
		lastCheckResult: { available: boolean; latestVersion: string | null; forced: boolean } | null;
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
	return (
		<div className="flex items-center justify-between my-2 text-sm gap-x-4">
			<span className="text-muted-foreground">{label}</span>
			<span className="flex-1 border border-dashed border-border/30" />
			<span className="font-mono">{value}</span>
			<Tippy content="Copy content">
				<Button size="icon-sm" variant="secondary">
					<CopyIcon className="size-3.5" />
				</Button>
			</Tippy>
		</div>
	);
}

function bytesToMB(bytes: number = 0) {
	return (bytes / 1024 ** 2).toFixed(2);
}

function formatPlatform(platform: string) {
	switch (platform) {
		case "linux":
			return "Linux";
		case "darwin":
			return "MacOs";
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
	return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default function InstanceOverviewPage() {
	const { data, mutate } = useSWR<OverviewResponse>("/instance/overview");

	const checkUpdates = useAction(
		() =>
			apiFetch<{
				currentVersion: string;
				latestVersion: string | null;
				available: boolean;
				forced: boolean;
				reason?: string;
			}>("/instance/updates/check", { method: "POST" }),
		{ error: "Could not check for updates" },
	);

	const toggleAutoCheck = useAction(
		(autoCheck: boolean) =>
			apiFetch<{ updates: OverviewResponse["updates"] }>("/instance/updates", {
				method: "PUT",
				body: JSON.stringify({ autoCheck }),
			}),
		{ error: "Could not save the setting" },
	);

	async function handleAutoCheckChange(autoCheck: boolean) {
		await toggleAutoCheck.trigger(autoCheck).catch(() => {});
		mutate();
	}

	return (
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
			<div className="space-y-4">
				<p className="">Server</p>
				<InfoRow
					label="Server IP"
					value={data ? (data.serverIp ?? "Could not be determined") : "—"}
				/>
				<InfoRow label="Name" value={data?.os?.name ?? "—"} />

				<p className="mt-8">Machine</p>
				<InfoRow
					label="Platform"
					value={`${formatPlatform(data?.os?.platform ?? "—")} (${data?.os?.platform ?? "-"})`}
				/>
				<InfoRow
					label="Architecture"
					value={`${data?.os?.arch ?? "—"} (${data?.os?.release ?? "-"})`}
				/>
				<InfoRow
					label="Memory"
					value={`${bytesToMB(data?.os?.freeMem)} / ${bytesToMB(data?.os?.totalMem)} MB`}
				/>
				<InfoRow label="Uptime" value={formatUptime(data?.os?.uptime)} />
				<p className="mt-8">Version</p>
				<InfoRow label="OSSPlay" value={data?.version ?? "—"} />
			</div>

			<Card className="mt-4">
				<CardHeader>
					<CardTitle>Updates</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<LoadingButton
						variant="secondary"
						className="w-fit"
						loading={checkUpdates.isLoading}
						onClick={() => checkUpdates.trigger()}
					>
						<RefreshCwIcon /> Check for updates
					</LoadingButton>
					{checkUpdates.data && (
						<p className="text-sm text-muted-foreground">
							{checkUpdates.data.reason
								? checkUpdates.data.reason
								: checkUpdates.data.available
									? `Update available: ${checkUpdates.data.latestVersion} (currently running ${checkUpdates.data.currentVersion}).`
									: `Up to date (${checkUpdates.data.currentVersion}).`}
						</p>
					)}

					<div className="flex items-center gap-2">
						<Checkbox
							id="auto-check-updates"
							checked={data?.updates.autoCheck ?? false}
							disabled={!data || toggleAutoCheck.isLoading}
							onCheckedChange={(checked) => handleAutoCheckChange(checked === true)}
						/>
						<label htmlFor="auto-check-updates" className="text-sm">
							Check for updates automatically
						</label>
					</div>
					{data?.updates.lastCheckedAt && (
						<p className="text-xs text-muted-foreground">
							Last automatic check: {formatDatetime(data.updates.lastCheckedAt)}
							{data.updates.lastCheckResult?.forced
								? " — flagged unsafe, update required."
								: data.updates.lastCheckResult?.available
									? ` — update available: ${data.updates.lastCheckResult.latestVersion}.`
									: " — up to date."}
						</p>
					)}
				</CardContent>
			</Card>
		</Container>
	);
}

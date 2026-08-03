"use client";

import { CopyIcon, RefreshCcwIcon, RefreshCwIcon, ServerIcon } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Container from "@/components/ui/container";
import { LoadingButton } from "@/components/ui/loading-button";
import { Tippy } from "@/components/ui/tooltip";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";

type OverviewResponse = {
	serverIp: string | null;
	versions: {
		api: string | null;
		dashboard: string | null;
		worker: string | null;
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
			apiFetch<{ available: boolean; reason: string }>("/instance/updates/check", {
				method: "POST",
			}),
		{ error: "Could not check for updates" },
	);

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
				<p className="mt-8">Versions</p>
				<InfoRow label="Dashboard" value={data?.versions.dashboard ?? "—"} />
				<InfoRow label="API" value={data?.versions.api ?? "—"} />
				<InfoRow label="Worker" value={data?.versions.worker ?? "—"} />
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
						<p className="text-sm text-muted-foreground">{checkUpdates.data.reason}</p>
					)}
				</CardContent>
			</Card>
		</Container>
	);
}

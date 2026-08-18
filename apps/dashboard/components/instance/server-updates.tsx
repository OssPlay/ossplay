"use client";

import { RefreshCwIcon } from "lucide-react";
import type { KeyedMutator } from "swr";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { apiFetch } from "@/lib/api";
import { openUpdateDialog } from "@/lib/update-dialog-store";
import { formatDatetime } from "@/lib/utils";

export interface UpdatesInfo {
	autoCheck: boolean;
	lastCheckedAt: string | null;
	lastCheckResult: {
		available: boolean;
		latestVersion: string | null;
		forced: boolean;
	} | null;
}

// Shared by the instance Web Server page and the onboarding wizard's
// "Updates" step — both need the same check-now/auto-check/last-result UI,
// just embedded in a different surrounding Container.
export function ServerUpdates<T extends { updates: UpdatesInfo }>({
	data,
	mutate,
}: {
	data: T;
	mutate: KeyedMutator<T>;
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
			apiFetch<{ updates: UpdatesInfo }>("/instance/overview/updates", {
				method: "PUT",
				body: JSON.stringify({ autoCheck }),
			}),
		{
			success: (result) => {
				mutate();
				return result.updates.autoCheck ? "Auto check enabled" : "Auto check disabled";
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

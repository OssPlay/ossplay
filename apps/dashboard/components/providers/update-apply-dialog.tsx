"use client";

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAction } from "@/hooks/use-action";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { closeUpdateDialog, useUpdateDialogOpen } from "@/lib/update-dialog-store";
import { useAuth } from "./auth-provider";

type JobStatus = "pending" | "pulling" | "migrating" | "restarting" | "done" | "failed";

interface Job {
	id: string;
	status: JobStatus;
	version: string;
	log: string[];
	error: string | null;
}

const STATUS_LABELS: Record<JobStatus, string> = {
	pending: "Starting…",
	pulling: "Pulling the new image…",
	migrating: "Running database migrations…",
	restarting: "Restarting the API and dashboard…",
	done: "Update complete",
	failed: "Update failed",
};

// Applying an update restarts the api container mid-flight (infra/updater/
// index.ts's applyUpdate() does `docker compose up -d --no-deps api
// dashboard`), so a poll landing exactly then gets a connection error, not
// a clean response — that's expected, not a failure. Only a definitive 404
// (the updater's own in-memory job map genuinely doesn't have this id
// anymore) means the job itself is actually gone; every other error is
// "the api container is mid-restart, try again shortly."
const POLL_INTERVAL_MS = 2500;

// Global (mounted once in AuthProvider, see components/providers/auth-
// provider.tsx) so the same in-progress job/poll state survives being
// opened from either trigger — the sidebar footer's "Update available"
// button (components/layout/account-dropdown.tsx, root-only) or the
// Instance page's "Update now" button (app/(app)/instance/page.tsx) — and
// keeps polling in the background even while closed, rather than each
// trigger owning its own dialog and losing track of the job the moment it
// unmounts.
export function UpdateApplyDialog() {
	const isOpen = useUpdateDialogOpen();
	const { instance, mutateInstance } = useAuth();
	const latestVersion = instance?.updates.latestVersion ?? null;

	const [job, setJob] = useState<Job | null>(null);
	const jobIdRef = useRef<string | null>(null);

	const apply = useAction(
		() =>
			apiFetch<{ started: boolean; jobId?: string; reason?: string }>(
				"/instance/overview/updates/apply",
				{ method: "POST", body: JSON.stringify({ version: latestVersion }) },
			),
		{ error: null },
	);

	async function handleConfirm() {
		const res = await apply.trigger().catch(() => null);
		if (!res) return;
		if (!res.started || !res.jobId) return;
		jobIdRef.current = res.jobId;
		setJob({
			id: res.jobId,
			status: "pending",
			version: latestVersion ?? "",
			log: [],
			error: null,
		});
	}

	// Runs for the lifetime of an active job, independent of dialog
	// open/closed state (this component never unmounts) — closing the
	// dialog just hides the UI, it doesn't abandon tracking the job.
	useEffect(() => {
		if (!job || job.status === "done" || job.status === "failed") return;
		let cancelled = false;

		const timer = setInterval(async () => {
			try {
				const latest = await apiFetch<Job>(`/instance/overview/updates/apply/${job.id}`);
				if (!cancelled) setJob(latest);
				if (!cancelled && (latest.status === "done" || latest.status === "failed")) {
					mutateInstance();
				}
			} catch (err) {
				if (err instanceof ApiError && err.status === 404) {
					if (!cancelled) {
						setJob((prev) =>
							prev
								? {
										...prev,
										status: "failed",
										error:
											"Lost track of this update job — it may have finished or the updater restarted.",
									}
								: prev,
						);
					}
					return;
				}
				// Any other error (network failure, 502/503 while api is mid-
				// restart) — transient, keep polling silently.
			}
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [job, mutateInstance]);

	function handleOpenChange(next: boolean) {
		if (!next) closeUpdateDialog();
	}

	function handleReset() {
		jobIdRef.current = null;
		setJob(null);
		apply.reset();
	}

	function handleReload() {
		window.location.reload();
	}

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				{!job ? (
					<>
						<DialogHeader>
							<DialogTitle>
								{latestVersion ? `Update to v${latestVersion}?` : "No update available"}
							</DialogTitle>
							<DialogDescription>
								{latestVersion
									? "This pulls the new image, runs any pending database migrations, and restarts the API and dashboard. It typically takes under a minute; this instance stays reachable throughout except for a brief reconnect at the end."
									: "There's no newer version to update to right now."}
							</DialogDescription>
						</DialogHeader>
						{apply.error && (
							<p className="text-sm text-destructive">
								{errorMessage(apply.error, "Could not start the update")}
							</p>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={() => closeUpdateDialog()}>
								Cancel
							</Button>
							{latestVersion && (
								<LoadingButton loading={apply.isLoading} onClick={handleConfirm}>
									Update now
								</LoadingButton>
							)}
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								{job.status === "done" ? (
									<CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-400" />
								) : job.status === "failed" ? (
									<TriangleAlertIcon className="size-5 text-destructive" />
								) : (
									<Loader2Icon className="size-5 animate-spin" />
								)}
								{STATUS_LABELS[job.status]}
							</DialogTitle>
							<DialogDescription>
								{job.status === "done"
									? `Now running v${job.version}. Reload to pick up the new dashboard build.`
									: job.status === "failed"
										? (job.error ?? "Something went wrong applying the update.")
										: `Updating to v${job.version}…`}
							</DialogDescription>
						</DialogHeader>
						{job.log.length > 0 && (
							<pre className="max-h-48 overflow-auto rounded-2xl bg-muted p-3 text-xs whitespace-pre-wrap">
								{job.log.join("\n")}
							</pre>
						)}
						<DialogFooter>
							{job.status === "failed" && (
								<Button variant="outline" onClick={handleReset}>
									Try again
								</Button>
							)}
							{job.status === "done" && <Button onClick={handleReload}>Reload page</Button>}
							{job.status !== "done" && job.status !== "failed" && (
								<Button variant="outline" onClick={() => closeUpdateDialog()}>
									Run in background
								</Button>
							)}
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

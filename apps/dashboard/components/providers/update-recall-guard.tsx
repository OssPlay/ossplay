"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "./auth-provider";

interface RecallCheckResponse {
	forced: boolean;
	forcedReason: string | null;
	currentVersion: string;
}

// Runs once per authenticated session (mounted inside AuthProvider, so it
// only fires after `me` resolves) — GET /updates/recall-check merges the
// GitHub Releases API with RELEASES.json's recall list (see
// apps/api/src/lib/updates/check.ts). If the version this instance is
// running has been flagged unsafe, every user sees a non-dismissible
// notice, not just root — `open` is a literal `true`, never backed by
// state that a close attempt (Escape, outside click) could flip, and
// `disablePointerDismissal` stops outside-press from even trying.
export function UpdateRecallGuard() {
	const { user } = useAuth();
	const router = useRouter();
	const { data } = useSWR<RecallCheckResponse>("/updates/recall-check", {
		revalidateOnFocus: false,
		revalidateIfStale: false,
	});

	if (!data?.forced) return null;

	return (
		<Dialog open disablePointerDismissal>
			<DialogContent showCloseButton={false} className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-destructive">
						<TriangleAlertIcon className="size-5" /> Update required
					</DialogTitle>
					<DialogDescription>
						This instance is running version {data.currentVersion}, which has been flagged as unsafe
						{data.forcedReason ? `: ${data.forcedReason}` : "."}
						{user.instanceRole === "root"
							? " Please update as soon as possible."
							: " Please let your instance administrator know."}
					</DialogDescription>
				</DialogHeader>
				{user.instanceRole === "root" && (
					<Button className="w-fit" onClick={() => router.push("/instance")}>
						Go to Updates
					</Button>
				)}
			</DialogContent>
		</Dialog>
	);
}

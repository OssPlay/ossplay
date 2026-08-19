"use client";

import {
	CheckIcon,
	ChevronDownIcon,
	DownloadIcon,
	Loader2Icon,
	RotateCwIcon,
	UploadIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTransfer } from "@/components/providers/transfer-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tippy } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Fixed, Google-Drive-style transfer tray — mounted once alongside
// TransferProvider so it persists across navigation instead of living
// inside Drive itself. Always rendered (even with zero tasks, just hidden)
// so its ResizeObserver never has to re-attach across mount/unmount; the
// height it reports drives (app)/layout.tsx's compensating bottom padding
// so a scrolled-to-the-bottom list is never hidden behind it.
//
// Stays open once transfers finish (no auto-hide) — the header's clear-all
// button is the only way tasks leave the list, and it's disabled while
// anything is still "active" so a still-in-progress transfer can't be
// dismissed out from under itself.
export function TransferPopover() {
	const { tasks, removeTask, clearTasks, setPopoverHeight } = useTransfer();
	const [collapsed, setCollapsed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: rootRef never changes identity, and the node stays mounted (just `hidden`) across empty/non-empty transitions, so this only needs to run once.
	useEffect(() => {
		const node = rootRef.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			setPopoverHeight(entries[0]?.contentRect.height ?? 0);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const activeCount = tasks.filter((t) => t.status === "active").length;
	const errorCount = tasks.filter((t) => t.status === "error").length;
	const summaryLabel =
		activeCount > 0
			? `${activeCount} in progress`
			: errorCount > 0
				? `${errorCount} failed`
				: "Done";

	return (
		<div
			ref={rootRef}
			className={cn(
				"fixed right-4 bottom-4 z-40 w-80 max-w-[calc(100vw-2rem)]",
				tasks.length === 0 && "hidden",
			)}
		>
			<div className="overflow-hidden rounded-2xl border bg-background shadow-lg">
				<div className="flex items-center gap-1 pr-1">
					<button
						type="button"
						onClick={() => setCollapsed((c) => !c)}
						className="flex flex-1 items-center gap-2 px-4 py-3 text-left text-sm font-medium"
					>
						{activeCount > 0 ? (
							<Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
						) : errorCount > 0 ? (
							<XIcon className="size-4 shrink-0 text-destructive" />
						) : (
							<CheckIcon className="size-4 shrink-0 text-primary" />
						)}
						<span className="flex-1 text-left">{summaryLabel}</span>
						<ChevronDownIcon
							className={cn("size-4 shrink-0 transition-transform", collapsed && "-rotate-90")}
						/>
					</button>
					<Tippy content={activeCount > 0 ? "Finish in-progress transfers first" : "Clear all"}>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={activeCount > 0}
							onClick={clearTasks}
							aria-label="Clear all"
						>
							<XIcon className="size-3.5" />
						</Button>
					</Tippy>
				</div>
				{!collapsed && (
					<div className="max-h-72 overflow-y-auto border-t">
						{tasks.map((task) => (
							<div key={task.id} className="flex items-center gap-2 px-4 py-2 text-sm">
								{task.kind === "upload" ? (
									<UploadIcon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate">{task.label}</p>
									{task.status === "active" && task.progress != null && (
										<Progress value={task.progress * 100} className="mt-1 h-1" />
									)}
									{task.status === "error" && (
										<p className="text-destructive text-xs">{task.error ?? "Failed"}</p>
									)}
								</div>
								{task.status === "done" && <CheckIcon className="size-4 shrink-0 text-primary" />}
								{task.status === "error" && task.retry && (
									<Tippy content="Retry">
										<Button variant="ghost" size="icon-sm" onClick={task.retry} aria-label="Retry">
											<RotateCwIcon className="size-3.5" />
										</Button>
									</Tippy>
								)}
								<Tippy content="Dismiss">
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => removeTask(task.id)}
										aria-label="Dismiss"
									>
										<XIcon className="size-3.5" />
									</Button>
								</Tippy>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

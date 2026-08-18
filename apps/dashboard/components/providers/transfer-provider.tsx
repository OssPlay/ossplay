"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface TransferTask {
	id: string;
	kind: "upload" | "download";
	label: string;
	status: "active" | "done" | "error";
	/** 0..1, only meaningful for uploads — download prep has no byte-level progress to report. */
	progress?: number;
	error?: string;
	retry?: () => void;
}

interface TransferContextValue {
	tasks: TransferTask[];
	addTask: (task: TransferTask) => void;
	updateTask: (id: string, patch: Partial<TransferTask>) => void;
	removeTask: (id: string) => void;
	popoverHeight: number;
	setPopoverHeight: (height: number) => void;
}

const TransferContext = createContext<TransferContextValue | null>(null);

// Mounted once at the authenticated app-shell level (app/(app)/layout.tsx),
// not per-page — so upload/download tasks started from Drive keep tracking
// (and the popover stays visible) even after navigating away from it
// entirely, the way Google Drive's own transfer tray behaves.
export function TransferProvider({ children }: { children: React.ReactNode }) {
	const [tasks, setTasks] = useState<TransferTask[]>([]);
	const [popoverHeight, setPopoverHeight] = useState(0);

	const addTask = useCallback((task: TransferTask) => {
		setTasks((prev) => [...prev, task]);
	}, []);
	const updateTask = useCallback((id: string, patch: Partial<TransferTask>) => {
		setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	}, []);
	const removeTask = useCallback((id: string) => {
		setTasks((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const value = useMemo(
		() => ({ tasks, addTask, updateTask, removeTask, popoverHeight, setPopoverHeight }),
		[tasks, addTask, updateTask, removeTask, popoverHeight],
	);

	return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>;
}

export function useTransfer() {
	const ctx = useContext(TransferContext);
	if (!ctx) throw new Error("useTransfer must be used within TransferProvider");
	return ctx;
}

"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { beginAction, endAction } from "@/lib/action-store";

export interface UseActionOptions<T> {
	/** Shown as a sonner loading toast for the duration of the call. */
	loading?: string;
	/** Shown as a sonner success toast — opt-in, most actions already show inline confirmation. */
	success?: string | ((data: T) => string);
	/**
	 * Shown as a sonner error toast. Defaults to the thrown error's message.
	 * Pass `null` to suppress the toast for an action whose caller already
	 * renders its own error UI and doesn't want a duplicate.
	 */
	error?: string | ((err: unknown) => string) | null;
	/** Counts toward the global active-action lock (beforeunload guard, Logout button). Default true. */
	blocking?: boolean;
}

export interface UseActionResult<Args extends unknown[], T> {
	trigger: (...args: Args) => Promise<T>;
	isLoading: boolean;
	error: unknown;
	data: T | undefined;
	reset: () => void;
}

function defaultErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : "Something went wrong";
}

// Fully functional async operator for one-off mutations (POST/PUT/DELETE
// calls, primarily via lib/api.ts's apiFetch): trigger/isLoading/error/data
// like a mutation hook, a toast on start/success/error, and registration in
// the global action store for the duration of the call — see
// lib/action-store.ts and components/action-guard.tsx.
export function useAction<Args extends unknown[], T>(
	fn: (...args: Args) => Promise<T>,
	options: UseActionOptions<T> = {},
): UseActionResult<Args, T> {
	const id = useId();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<unknown>(undefined);
	const [data, setData] = useState<T | undefined>(undefined);

	// Not wrapped in useCallback: call sites pass a fresh inline `fn` (and
	// often `options`) on every render, closing over current props/state
	// (e.g. a user id, a form field value) — memoizing against a stale
	// snapshot of those would silently use outdated values on later calls.
	// Nothing here needs trigger to be referentially stable across renders.
	async function trigger(...args: Args): Promise<T> {
		setIsLoading(true);
		setError(undefined);
		if (options.blocking !== false) beginAction(id, options.loading);

		const toastId = options.loading ? toast.loading(options.loading) : undefined;

		try {
			const result = await fn(...args);
			setData(result);
			if (options.success) {
				const message =
					typeof options.success === "function" ? options.success(result) : options.success;
				toast.success(message, { id: toastId });
			} else if (toastId !== undefined) {
				toast.dismiss(toastId);
			}
			return result;
		} catch (err) {
			setError(err);
			if (options.error !== null) {
				const message =
					typeof options.error === "function"
						? options.error(err)
						: (options.error ?? defaultErrorMessage(err));
				toast.error(message, { id: toastId });
			} else if (toastId !== undefined) {
				toast.dismiss(toastId);
			}
			throw err;
		} finally {
			setIsLoading(false);
			if (options.blocking !== false) endAction(id);
		}
	}

	function reset(): void {
		setError(undefined);
		setData(undefined);
	}

	return { trigger, isLoading, error, data, reset };
}

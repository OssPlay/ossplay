"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useDebouncedValue } from "./use-debounced-value";
import useURL from "./use-url";

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 25;

export interface ListEnvelope {
	total: number;
	page: number;
	pageSize: number;
}

export interface UseServerTableOptions<TResponse extends ListEnvelope, TItem> {
	/** API path, relative to the API base (e.g. "/instance/ssh-keys"). */
	endpoint: string;
	/** Pulls the row array out of the endpoint's response envelope. */
	items: (response: TResponse) => TItem[];
	pageSize?: number;
}

export interface DateRange {
	gt: string | null;
	lt: string | null;
}

export interface ServerTable<TItem> {
	items: TItem[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
	isLoading: boolean;
	error: unknown;
	mutate: () => void;
	search: string;
	setSearch: (value: string) => void;
	setPage: (page: number) => void;
	setPageSize: (size: number) => void;
	getFilter: (key: string) => string[];
	setFilter: (key: string, values: string[]) => void;
	getDateRange: (key: string) => DateRange;
	setDateRange: (key: string, range: Partial<DateRange>) => void;
	hasActiveFilters: boolean;
	resetFilters: () => void;
}

// The single FE half of the shared list-query contract (BE half:
// apps/api/src/lib/http/list-query.ts): `q`, `filter_<key>=a,b,c`,
// `<key>_gt`/`<key>_lt`, `page`, `per_page` — all read from and written back
// to the URL via useURL(), so pagination/filter state survives navigation
// and is shareable as a link. One hook here means every table (SSH keys
// today, Users/Audit Logs once backported) speaks the same query shape
// instead of a page-specific reimplementation.
export function useServerTable<TResponse extends ListEnvelope, TItem>({
	endpoint,
	items,
	pageSize: defaultPageSize = DEFAULT_PAGE_SIZE,
}: UseServerTableOptions<TResponse, TItem>): ServerTable<TItem> {
	const url = useURL();

	const [searchInput, setSearchInput] = useState(url.getQueryParam("q") ?? "");
	const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

	// Only the debounced value should re-trigger this — url is a fresh object
	// every render (derived from the current search params) and would
	// otherwise fire this on its own writes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally excludes `url` — see above.
	useEffect(() => {
		if (debouncedSearch === (url.getQueryParam("q") ?? "")) return;
		url.setQueryParams({ q: debouncedSearch || null, page: null });
	}, [debouncedSearch]);

	const page = Math.max(0, Number.parseInt(url.getQueryParam("page") ?? "0", 10) || 0);
	const pageSize = Math.max(
		1,
		Number.parseInt(url.getQueryParam("per_page") ?? "", 10) || defaultPageSize,
	);

	const query = new URLSearchParams(url.url.search);
	if (!query.has("per_page")) query.set("per_page", String(pageSize));
	const queryString = query.toString();

	const { data, error, isLoading, mutate } = useSWR<TResponse>(
		`${endpoint}${queryString ? `?${queryString}` : ""}`,
	);

	function setPage(next: number) {
		url.setQueryParams({ page: next > 0 ? String(next) : null });
	}

	function setPageSize(size: number) {
		url.setQueryParams({ per_page: String(size), page: null });
	}

	function getFilter(key: string): string[] {
		const raw = url.getQueryParam(`filter_${key}`);
		return raw ? raw.split(",").filter(Boolean) : [];
	}

	function setFilter(key: string, values: string[]) {
		url.setQueryParams({
			[`filter_${key}`]: values.length > 0 ? values.join(",") : null,
			page: null,
		});
	}

	function getDateRange(key: string): DateRange {
		return { gt: url.getQueryParam(`${key}_gt`), lt: url.getQueryParam(`${key}_lt`) };
	}

	function setDateRange(key: string, range: Partial<DateRange>) {
		const params: Record<string, string | null> = { page: null };
		if ("gt" in range) params[`${key}_gt`] = range.gt ?? null;
		if ("lt" in range) params[`${key}_lt`] = range.lt ?? null;
		url.setQueryParams(params);
	}

	const filterKeys = Array.from(url.url.searchParams.keys()).filter(
		(key) => key.startsWith("filter_") || key.endsWith("_gt") || key.endsWith("_lt"),
	);

	function resetFilters() {
		const params: Record<string, string | null> = { q: null, page: null };
		for (const key of filterKeys) params[key] = null;
		setSearchInput("");
		url.setQueryParams(params);
	}

	const total = data?.total ?? 0;
	const resolvedPageSize = data?.pageSize ?? pageSize;

	return {
		items: data ? items(data) : [],
		total,
		page: data?.page ?? page,
		pageSize: resolvedPageSize,
		pageCount: Math.max(1, Math.ceil(total / resolvedPageSize)),
		isLoading,
		error,
		mutate,
		search: searchInput,
		setSearch: setSearchInput,
		setPage,
		setPageSize,
		getFilter,
		setFilter,
		getDateRange,
		setDateRange,
		hasActiveFilters: filterKeys.length > 0 || searchInput.length > 0,
		resetFilters,
	};
}

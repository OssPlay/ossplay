'use client';

import { useMemo, useState } from 'react';

export interface UsePaginatedListResult<T> {
  query: string;
  setQuery: (query: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageItems: T[];
  filteredCount: number;
  totalPages: number;
}

// Client-side search + paginate for lists the API returns in full (instance
// operator-scale data — users, and later audit logs — never large enough to
// need real server-side pagination). Changing the query or page size always
// snaps back to page 0, since a stale page index almost certainly points
// past the end of a newly-filtered/resized list.
export function usePaginatedList<T>(
  items: T[],
  matches: (item: T, query: string) => boolean,
  defaultPageSize = 10,
): UsePaginatedListResult<T> {
  const [query, setQueryState] = useState('');
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return trimmed ? items.filter((item) => matches(item, trimmed)) : items;
  }, [items, query, matches]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function setQuery(next: string): void {
    setQueryState(next);
    setPage(0);
  }

  function setPageSize(next: number): void {
    setPageSizeState(next);
    setPage(0);
  }

  return {
    query,
    setQuery,
    page: clampedPage,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    filteredCount: filtered.length,
    totalPages,
  };
}

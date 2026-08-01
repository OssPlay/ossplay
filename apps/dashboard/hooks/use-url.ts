'use client';

import { usePathname, useSearchParams } from 'next/navigation';

export default function useURL() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const url = new URL(
    pathname,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );
  for (const [key, value] of searchParams.entries()) {
    url.searchParams.append(key, value);
  }

  return url;
}

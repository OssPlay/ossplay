'use client';

import { useEffect, useState } from 'react';

// Delays reflecting `value` until it's held steady for `delayMs` — used to
// keep a search input's keystrokes from firing a request per character.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

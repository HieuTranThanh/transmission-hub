import { useEffect, useState } from "react";

/** Returns a debounced copy of `value` that only updates after `delayMs` of
 *  no changes. Used to throttle per-keystroke search inputs into one DB query
 *  per pause instead of one per character. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

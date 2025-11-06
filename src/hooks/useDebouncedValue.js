import { useEffect, useState } from "react";

/**
 * Returns a debounced version of the input value.
 * Updates only after the given delay in milliseconds has elapsed.
 */
export default function useDebouncedValue(value, delayMs = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

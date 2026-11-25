export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run the pending call now, if there is one. */
  flush(): void;
  /** Drop the pending call. */
  cancel(): void;
  pending(): boolean;
}

/** Trailing-edge debounce with flush/cancel, used for autosave. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const invoke = () => {
    const args = lastArgs as A;
    timer = undefined;
    lastArgs = undefined;
    fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(invoke, waitMs);
  }) as Debounced<A>;

  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    invoke();
  };

  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };

  debounced.pending = () => timer !== undefined;

  return debounced;
}

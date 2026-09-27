export interface Cached<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function cached<T>(ttlMs: number, load: () => Promise<T>): Cached<T> {
  let entry: { value: T; expires: number } | undefined;
  let loading: Promise<T> | undefined;
  let generation = 0;

  function refresh(): Promise<T> {
    const started = generation;
    const pending = load()
      .then((value) => {
        if (started === generation) entry = { value, expires: Date.now() + ttlMs };
        return value;
      })
      .finally(() => {
        if (loading === pending) loading = undefined;
      });
    loading = pending;
    return pending;
  }

  return {
    async get() {
      if (entry && entry.expires > Date.now()) return entry.value;
      return loading ?? refresh();
    },
    invalidate() {
      generation++;
      entry = undefined;
      loading = undefined;
    },
  };
}

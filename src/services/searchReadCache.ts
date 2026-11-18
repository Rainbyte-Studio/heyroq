export function createSearchReadCache<T>(load: () => Promise<T>, ttlMs: number, now = Date.now) {
  let pending: Promise<T> | undefined;
  let cached: { value: T; expires: number } | undefined;

  function read(): Promise<T> {
    if (cached && cached.expires > now()) return Promise.resolve(cached.value);
    if (pending) return pending;

    const request = Promise.resolve().then(load).then(value => {
      if (pending === request) cached = { value, expires: now() + ttlMs };
      return value;
    }).finally(() => {
      if (pending === request) pending = undefined;
    });
    pending = request;
    return request;
  }

  return {
    read,
    invalidate() {
      pending = undefined;
      cached = undefined;
    },
  };
}

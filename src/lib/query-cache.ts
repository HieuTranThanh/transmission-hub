// Lightweight in-memory cache for Supabase queries. Data only changes when a
// new batch is imported (CLI), so caching for a few minutes eliminates redundant
// round-trips when the user navigates between pages (Dashboard → IpAudit →
// Routing → Reclaim all share `dashboard_summary`, filter rows, etc.).
//
// Features:
// - TTL-based expiry (default 5 min)
// - Request deduplication: concurrent calls for the same key share one promise
// - Failed requests are never cached

const DEFAULT_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) {
    return Promise.resolve(entry.data as T);
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, ts: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** Drop all cached entries — call after a new batch import if needed. */
export function invalidateCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Cache TTL en memoria con "stale-while-error":
 * si la fuente externa falla y hay un valor vencido pero aún utilizable,
 * se devuelve el valor viejo en lugar de propagar el error.
 *
 * Suficiente para una instancia (dev / VPS / contenedor único). Para
 * despliegues serverless con múltiples instancias, reemplazar por
 * Redis/Upstash manteniendo esta misma interfaz.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_ENTRIES = 500;

function prune(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.staleUntil < now) store.delete(key);
  }
  // si sigue lleno, borrar los más viejos
  if (store.size > MAX_ENTRIES) {
    const keys = [...store.keys()].slice(0, store.size - MAX_ENTRIES);
    for (const key of keys) store.delete(key);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) return undefined;
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, staleTtlMs?: number): void {
  const now = Date.now();
  store.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleUntil: now + (staleTtlMs ?? ttlMs * 6),
  });
  prune();
}

/**
 * Devuelve el valor cacheado si está fresco; si no, ejecuta `fetcher`.
 * Deduplica requests concurrentes al mismo recurso y, ante un error del
 * fetcher, devuelve el último valor conocido si todavía está en ventana stale.
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  staleTtlMs?: number,
): Promise<T> {
  const fresh = cacheGet<T>(key);
  if (fresh !== undefined) return fresh;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fetcher();
      cacheSet(key, value, ttlMs, staleTtlMs);
      return value;
    } catch (err) {
      const entry = store.get(key) as CacheEntry<T> | undefined;
      if (entry && entry.staleUntil >= Date.now()) {
        return entry.value;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Solo para tests */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
}

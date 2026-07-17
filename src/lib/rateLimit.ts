/**
 * Rate limiting simple por ventana fija, en memoria.
 * Igual que el cache: válido para una instancia; en serverless multi-instancia
 * conviene Redis. La interfaz se mantiene para poder cambiar la implementación.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** segundos hasta que se libera la ventana */
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** Identifica al cliente para rate limiting sin almacenar datos personales. */
export function clientKey(request: Request, bucketName: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "local";
  return `${bucketName}:${ip}`;
}

/** Solo para tests */
export function rateLimitClear(): void {
  buckets.clear();
}

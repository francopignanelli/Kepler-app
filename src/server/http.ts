import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { scrubSecrets } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import type { ApiError } from "@/types";

/** Error tipado para fallas de APIs externas (nunca incluye la URL con key). */
export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_TIMEOUT_MS = 9000;

/** fetch con timeout + parseo JSON + errores saneados (sin secrets). */
export async function fetchJson<T>(
  service: string,
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json", ...rest.headers },
      // los datos externos se cachean con nuestra capa propia, no la de Next
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error ? scrubSecrets(err.message) : "network error";
    throw new UpstreamError(service, null, `No se pudo contactar ${service}: ${reason}`);
  }

  if (!response.ok) {
    throw new UpstreamError(
      service,
      response.status,
      `${service} respondió ${response.status}`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError(service, response.status, `${service} devolvió JSON inválido`);
  }
}

/** Igual que fetchJson pero para respuestas de texto plano (TLE). */
export async function fetchText(
  service: string,
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    const reason = err instanceof Error ? scrubSecrets(err.message) : "network error";
    throw new UpstreamError(service, null, `No se pudo contactar ${service}: ${reason}`);
  }
  if (!response.ok) {
    throw new UpstreamError(service, response.status, `${service} respondió ${response.status}`);
  }
  return response.text();
}

// ---------------------------------------------------------------------------
// Respuestas de error uniformes
// ---------------------------------------------------------------------------

export function apiError(
  status: number,
  code: ApiError["code"],
  message: string,
  extraHeaders?: Record<string, string>,
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: scrubSecrets(message), code },
    { status, headers: extraHeaders },
  );
}

/**
 * Valida query params con Zod y aplica rate limiting.
 * Devuelve los datos parseados o una respuesta de error lista para retornar.
 */
export function guardRequest<S extends ZodType>(
  request: Request,
  schema: S,
  options: { bucket: string; limitPerMinute: number },
):
  | { ok: true; data: import("zod").output<S> }
  | { ok: false; response: NextResponse<ApiError> } {
  const limited = rateLimit(clientKey(request, options.bucket), options.limitPerMinute);
  if (!limited.allowed) {
    return {
      ok: false,
      response: apiError(429, "RATE_LIMITED", "Demasiadas solicitudes, probá de nuevo en unos segundos", {
        "Retry-After": String(limited.retryAfterSec),
      }),
    };
  }

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.join(".") || "query";
    return {
      ok: false,
      response: apiError(400, "VALIDATION_ERROR", `Parámetro inválido (${where}): ${issue?.message ?? "error"}`),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Mapea errores internos a respuestas seguras. */
export function handleRouteError(err: unknown): NextResponse<ApiError> {
  if (err instanceof UpstreamError) {
    console.error(`[upstream:${err.service}]`, scrubSecrets(err.message));
    return apiError(502, "UPSTREAM_ERROR", `La fuente de datos externa (${err.service}) no está disponible`);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api]", scrubSecrets(message));
  return apiError(500, "INTERNAL_ERROR", "Error interno del servidor");
}

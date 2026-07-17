/**
 * Cliente HTTP del frontend hacia /api/*.
 * Nunca habla con APIs externas directamente: todos los secrets viven en el server.
 */

import type { ApiError } from "@/types";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiError["code"] | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Sin conexión con el servidor");
  }

  if (!response.ok) {
    let body: Partial<ApiError> = {};
    try {
      body = await response.json();
    } catch {
      // cuerpo no JSON: usamos defaults
    }
    throw new ApiClientError(
      response.status,
      body.code ?? "INTERNAL_ERROR",
      body.error ?? `Error ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

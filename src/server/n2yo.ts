/**
 * Cliente de servidor para N2YO.com — satélites sobre el observador.
 *
 * La key vive SOLO acá (N2YO_API_KEY). Límite del plan free: 100 requests
 * por hora para /above, así que el cache es agresivo (30 s por celda de
 * coordenadas + categoría) y con ventana stale larga: si N2YO falla o se
 * agota el límite, se sirve la última respuesta válida conocida.
 */

import { getOrFetch } from "@/lib/cache";
import { getN2yoApiKey } from "@/lib/env";
import { SAT_CATEGORIES } from "@/lib/satellites";
import { fetchJson, UpstreamError } from "@/server/http";
import { MissingApiKeyError } from "@/server/weather";
import type { AboveSatellite, SatCategoryId, SatellitesAbove } from "@/types";

const N2YO_BASE = "https://api.n2yo.com/rest/v1/satellite";

const ABOVE_TTL_MS = 30_000;
/** ante fallas o rate limit de N2YO, servir datos de hasta 20 minutos */
const ABOVE_STALE_MS = 20 * 60_000;
const RETRY_DELAY_MS = 600;

interface N2yoAboveResponse {
  info: { category: string; transactionscount: number; satcount: number };
  above: Array<{
    satid: number;
    satname: string;
    intDesignator: string;
    launchDate: string;
    satlat: number;
    satlng: number;
    satalt: number;
  }>;
}

/** timeout por intento: deja margen bajo el maxDuration de la ruta */
const N2YO_TIMEOUT_MS = 8_000;

/**
 * Un reintento moderado, solo para 5xx esporádicos de N2YO bajo carga.
 * Un timeout o error de red (status null) NO se reintenta: reintentar un
 * cuelgue solo duplica la espera sin mejorar nada, y agota el presupuesto
 * de tiempo de la función serverless.
 */
async function fetchWithRetry<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>("n2yo", url, { timeoutMs: N2YO_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof UpstreamError && err.status !== null && err.status >= 500) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return fetchJson<T>("n2yo", url, { timeoutMs: N2YO_TIMEOUT_MS });
    }
    throw err;
  }
}

export async function getSatellitesAbove(
  lat: number,
  lon: number,
  category: SatCategoryId,
  searchRadiusDeg = 90,
): Promise<SatellitesAbove> {
  const apiKey = getN2yoApiKey();
  if (!apiKey) {
    // log inequívoco: si esto no aparece en los logs de la función, el 503
    // que se vio no vino de esta rama (código viejo desplegado, o el error
    // real es el catch de más abajo con otra causa)
    console.error("[n2yo] N2YO_API_KEY no está presente en process.env de esta función");
    throw new MissingApiKeyError("N2YO_API_KEY");
  }

  const catInfo = SAT_CATEGORIES[category];
  // celda de ~11 km: observadores cercanos comparten cache
  const cacheKey = `above:${category}:${lat.toFixed(1)}:${lon.toFixed(1)}:${searchRadiusDeg}`;

  return getOrFetch<SatellitesAbove>(
    cacheKey,
    ABOVE_TTL_MS,
    async () => {
      const url = `${N2YO_BASE}/above/${lat.toFixed(4)}/${lon.toFixed(4)}/0/${searchRadiusDeg}/${catInfo.n2yoId}/&apiKey=${apiKey}`;
      const data = await fetchWithRetry<N2yoAboveResponse>(url);
      if (!data || !Array.isArray(data.above)) {
        throw new UpstreamError("n2yo", null, "N2YO devolvió una respuesta inválida");
      }
      const satellites: AboveSatellite[] = data.above.map((s) => ({
        noradId: s.satid,
        name: s.satname,
        intlDesignator: s.intDesignator,
        launchDate: s.launchDate,
        lat: s.satlat,
        lon: s.satlng,
        altitudeKm: s.satalt,
        category,
      }));
      return {
        category,
        total: data.info?.satcount ?? satellites.length,
        satellites,
        fetchedAt: Date.now(),
      };
    },
    ABOVE_STALE_MS,
  );
}

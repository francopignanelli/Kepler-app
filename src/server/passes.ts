/**
 * Agregador de pasadas de la ISS.
 *
 * Fuente de pasadas:
 *  - N2YO visualpasses si hay N2YO_API_KEY (con fallback a cálculo local).
 *  - Cálculo local SGP4 desde TLE (CelesTrak) si no hay key: la app funciona
 *    completa sin depender de servicios con registro.
 *
 * Enriquecimiento:
 *  - WeatherAPI Forecast (hora más cercana al pico de la pasada + astronomía
 *    del día) para calcular skyVisibility y el score final de observación.
 *  - Si no hay WEATHER_API_KEY, se devuelven las pasadas con score
 *    geométrico y timezone resuelta vía WhereTheISS.at.
 */

import { getOrFetch } from "@/lib/cache";
import { getN2yoApiKey } from "@/lib/env";
import { azimuthToCompass } from "@/lib/geo";
import { predictPasses, rawPassToSatellitePass, tleToSatrec } from "@/lib/orbital";
import { toEpochSeconds } from "@/lib/time";
import { fetchJson } from "@/server/http";
import { getIssTle, getTimezoneForCoords, ISS_NORAD_ID } from "@/server/iss";
import { getForecast } from "@/server/weather";
import {
  buildRecommendation,
  calculateGeometryOnlyScore,
  calculateISSObservationScore,
  calculateSkyVisibility,
  getSkyVisibilityLabel,
} from "@/services/visibilityService";
import type {
  EnrichedPass,
  ForecastDay,
  PassesResponse,
  SatellitePass,
  WeatherForecast,
  WeatherHour,
} from "@/types";

const PASSES_TTL_MS = 30 * 60_000;
/** máxima distancia entre el pico de la pasada y la hora de forecast usable */
const MAX_HOUR_DISTANCE_SEC = 90 * 60;

// ---------------------------------------------------------------------------
// Fuente 1: N2YO
// ---------------------------------------------------------------------------

interface N2yoPass {
  startAz: number;
  startUTC: number;
  maxAz: number;
  maxEl: number;
  maxUTC: number;
  endAz: number;
  endUTC: number;
  mag?: number;
  duration: number;
}

interface N2yoVisualPassesResponse {
  info: { passescount: number };
  passes?: N2yoPass[];
}

async function getPassesFromN2yo(
  key: string,
  lat: number,
  lon: number,
  days: number,
): Promise<SatellitePass[]> {
  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${ISS_NORAD_ID}/${lat.toFixed(4)}/${lon.toFixed(4)}/0/${days}/60/&apiKey=${key}`;
  const data = await fetchJson<N2yoVisualPassesResponse>("n2yo", url);
  return (data.passes ?? []).map((p) => ({
    startTime: new Date(p.startUTC * 1000).toISOString(),
    peakTime: new Date(p.maxUTC * 1000).toISOString(),
    endTime: new Date(p.endUTC * 1000).toISOString(),
    durationMinutes: Math.round((p.duration / 60) * 10) / 10,
    maxElevation: Math.round(p.maxEl),
    startAzimuth: Math.round(p.startAz),
    endAzimuth: Math.round(p.endAz),
    startDirection: azimuthToCompass(p.startAz),
    endDirection: azimuthToCompass(p.endAz),
    magnitude: typeof p.mag === "number" && p.mag < 100 ? p.mag : null,
    // N2YO visualpasses ya filtra por visibilidad óptica
    isVisible: true,
  }));
}

// ---------------------------------------------------------------------------
// Fuente 2: SGP4 local
// ---------------------------------------------------------------------------

async function getPassesFromSgp4(
  lat: number,
  lon: number,
  days: number,
  minElevation: number,
): Promise<SatellitePass[]> {
  const tle = await getIssTle();
  const satrec = tleToSatrec(tle.line1, tle.line2);
  const raw = predictPasses(satrec, { lat, lon }, { days, minElevationDeg: minElevation });
  return raw.map(rawPassToSatellitePass);
}

// ---------------------------------------------------------------------------
// Enriquecimiento con clima + astronomía
// ---------------------------------------------------------------------------

function findClosestHour(
  forecast: WeatherForecast,
  peakEpochSec: number,
): { hour: WeatherHour; day: ForecastDay } | null {
  let best: { hour: WeatherHour; day: ForecastDay; distance: number } | null = null;
  for (const day of forecast.days) {
    for (const hour of day.hours) {
      const distance = Math.abs(hour.timeEpoch - peakEpochSec);
      if (!best || distance < best.distance) {
        best = { hour, day, distance };
      }
    }
  }
  if (!best || best.distance > MAX_HOUR_DISTANCE_SEC) return null;
  return { hour: best.hour, day: best.day };
}

function enrichPass(pass: SatellitePass, forecast: WeatherForecast | null): EnrichedPass {
  const passId = `${ISS_NORAD_ID}-${toEpochSeconds(pass.startTime)}`;

  const match = forecast ? findClosestHour(forecast, toEpochSeconds(pass.peakTime)) : null;

  if (!match) {
    const score = calculateGeometryOnlyScore(pass);
    return {
      passId,
      pass,
      weather: null,
      astronomy: null,
      scores: {
        skyVisibility: null,
        issObservation: score,
        label: getSkyVisibilityLabel(score),
      },
      recommendation: buildRecommendation(pass, null, score),
    };
  }

  const { hour, day } = match;
  const astro = day.astro;

  const skyVisibility = calculateSkyVisibility(
    {
      cloud: hour.cloud,
      visKm: hour.visKm,
      precipMm: hour.precipMm,
      chanceOfRain: hour.chanceOfRain,
      humidity: hour.humidity,
      isDay: hour.isDay,
    },
    {
      // el flag horario es más fiel que el diario para saber si es de noche
      isSunUp: hour.isDay,
      isMoonUp: astro.isMoonUp,
      moonIllumination: astro.moonIllumination,
    },
  );

  const observation = calculateISSObservationScore(
    { maxElevation: pass.maxElevation, durationMinutes: pass.durationMinutes },
    skyVisibility,
    { isSunUp: hour.isDay, isMoonUp: astro.isMoonUp, moonIllumination: astro.moonIllumination },
    { isDay: hour.isDay },
  );

  return {
    passId,
    pass,
    weather: {
      condition: hour.condition,
      icon: hour.icon,
      code: hour.code,
      tempC: hour.tempC,
      feelsLikeC: hour.feelsLikeC,
      cloud: hour.cloud,
      visibilityKm: hour.visKm,
      humidity: hour.humidity,
      precipMm: hour.precipMm,
      chanceOfRain: hour.chanceOfRain,
      windKph: hour.windKph,
      gustKph: hour.gustKph,
      isDay: hour.isDay,
    },
    astronomy: {
      sunrise: astro.sunrise,
      sunset: astro.sunset,
      moonrise: astro.moonrise,
      moonset: astro.moonset,
      moonPhase: astro.moonPhase,
      moonIllumination: astro.moonIllumination,
      isMoonUp: astro.isMoonUp,
      isSunUp: astro.isSunUp,
    },
    scores: {
      skyVisibility,
      issObservation: observation,
      label: getSkyVisibilityLabel(observation),
    },
    recommendation: buildRecommendation(
      pass,
      skyVisibility,
      observation,
      { cloud: hour.cloud, chanceOfRain: hour.chanceOfRain },
      { isMoonUp: astro.isMoonUp, moonIllumination: astro.moonIllumination },
    ),
  };
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export async function getEnrichedPasses(
  lat: number,
  lon: number,
  days: number,
  minElevation: number,
): Promise<PassesResponse> {
  const cacheKey = `passes:${lat.toFixed(2)}:${lon.toFixed(2)}:${days}:${minElevation}`;

  return getOrFetch(cacheKey, PASSES_TTL_MS, async () => {
    // 1. Pasadas
    let passes: SatellitePass[];
    let source: PassesResponse["source"] = "sgp4";

    const n2yoKey = getN2yoApiKey();
    if (n2yoKey) {
      try {
        passes = await getPassesFromN2yo(n2yoKey, lat, lon, days);
        source = "n2yo";
      } catch {
        passes = await getPassesFromSgp4(lat, lon, days, minElevation);
      }
    } else {
      passes = await getPassesFromSgp4(lat, lon, days, minElevation);
    }

    // solo pasadas futuras, ordenadas
    const now = Date.now();
    passes = passes
      .filter((p) => new Date(p.endTime).getTime() > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // 2. Clima: WeatherAPI → Open-Meteo (sin key); si todo falla, seguimos sin clima
    let forecast: WeatherForecast | null = null;
    try {
      forecast = await getForecast(lat, lon, Math.min(days, 3));
    } catch (err) {
      console.error("[passes] forecast no disponible:", err instanceof Error ? err.message : err);
    }

    // 3. Timezone
    const timezone = forecast?.location.tzId ?? (await getTimezoneForCoords(lat, lon));

    return {
      location: {
        lat,
        lon,
        name: forecast?.location.name,
        timezone,
      },
      passes: passes.map((p) => enrichPass(p, forecast)),
      source,
      weatherAvailable: forecast !== null,
      generatedAt: Date.now(),
    };
  });
}

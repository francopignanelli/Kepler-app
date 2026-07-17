/**
 * Servicio de servidor para estaciones espaciales (ISS, Tiangong).
 * Fuentes: CelesTrak (TLE primario por NORAD ID) y WhereTheISS.at
 * (posición en vivo y TLE de respaldo, solo para la ISS). Si la posición
 * en vivo falla o la estación no tiene fuente en vivo, se usa propagación
 * SGP4 local desde el último TLE conocido.
 */

import { getOrFetch } from "@/lib/cache";
import {
  computeGroundTrack,
  getLookAngles,
  getSatSnapshot,
  tleToSatrec,
  type ObserverGeo,
} from "@/lib/orbital";
import { STATIONS } from "@/lib/satellites";
import { fetchJson, fetchText, UpstreamError } from "@/server/http";
import type { GroundTrack, SatellitePosition, StationId, Tle } from "@/types";

export const ISS_NORAD_ID = STATIONS.iss.noradId;

const TLE_TTL_MS = 6 * 3600_000; // los TLE se publican varias veces al día
const TLE_STALE_MS = 7 * 24 * 3600_000; // un TLE de hasta ~1 semana sigue siendo usable
const POSITION_TTL_MS = 3_000;
const TRACK_TTL_MS = 5 * 60_000;
const TIMEZONE_TTL_MS = 24 * 3600_000;

interface WhereTheIssPosition {
  name: string;
  id: number;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: "daylight" | "eclipsed";
  timestamp: number;
}

interface WhereTheIssTle {
  requested_timestamp: number;
  tle_timestamp: number;
  id: number;
  name: string;
  header: string;
  line1: string;
  line2: string;
}

interface WhereTheIssCoordinates {
  latitude: number;
  longitude: number;
  timezone_id: string;
  offset: number;
  country_code: string;
}

// ---------------------------------------------------------------------------
// TLE
// ---------------------------------------------------------------------------

function parseCelestrakTle(text: string, fallbackName: string): { name: string; line1: string; line2: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line1 = lines.find((l) => l.startsWith("1 "));
  const line2 = lines.find((l) => l.startsWith("2 "));
  if (!line1 || !line2) {
    throw new UpstreamError("celestrak", null, "CelesTrak devolvió un TLE inválido");
  }
  const name = lines.find((l) => !l.startsWith("1 ") && !l.startsWith("2 ")) ?? fallbackName;
  return { name, line1, line2 };
}

export async function getStationTle(stationId: StationId): Promise<Tle> {
  const station = STATIONS[stationId];
  return getOrFetch<Tle>(
    `tle:${station.noradId}`,
    TLE_TTL_MS,
    async () => {
      try {
        const text = await fetchText(
          "celestrak",
          `https://celestrak.org/NORAD/elements/gp.php?CATNR=${station.noradId}&FORMAT=tle`,
        );
        const parsed = parseCelestrakTle(text, station.name);
        return { ...parsed, fetchedAt: Date.now(), source: "celestrak" as const };
      } catch (err) {
        // WhereTheISS solo trackea la ISS: para el resto no hay respaldo
        if (stationId !== "iss") throw err;
        const data = await fetchJson<WhereTheIssTle>(
          "wheretheiss",
          `https://api.wheretheiss.at/v1/satellites/${station.noradId}/tles`,
        );
        return {
          name: data.name || "ISS (ZARYA)",
          line1: data.line1,
          line2: data.line2,
          fetchedAt: Date.now(),
          source: "wheretheiss" as const,
        };
      }
    },
    TLE_STALE_MS,
  );
}

/** Compat: usado por el motor de pasadas (hoy solo predice la ISS). */
export async function getIssTle(): Promise<Tle> {
  return getStationTle("iss");
}

// ---------------------------------------------------------------------------
// Posición actual
// ---------------------------------------------------------------------------

async function getSgp4Position(stationId: StationId): Promise<SatellitePosition> {
  const station = STATIONS[stationId];
  const tle = await getStationTle(stationId);
  const satrec = tleToSatrec(tle.line1, tle.line2);
  const now = new Date();
  const snap = getSatSnapshot(satrec, now);
  if (!snap) {
    throw new UpstreamError("sgp4", null, `No se pudo propagar la posición de ${station.shortName}`);
  }
  return {
    noradId: station.noradId,
    name: station.shortName,
    lat: snap.lat,
    lon: snap.lon,
    altitudeKm: snap.altitudeKm,
    velocityKmh: snap.velocityKmh,
    timestamp: now.getTime(),
    visibility: snap.sunlit ? ("daylight" as const) : ("eclipsed" as const),
    source: "sgp4" as const,
  };
}

export async function getStationPosition(
  stationId: StationId,
  observer?: ObserverGeo,
): Promise<SatellitePosition> {
  const station = STATIONS[stationId];
  const position = await getOrFetch<SatellitePosition>(
    `position:${station.noradId}`,
    POSITION_TTL_MS,
    async () => {
      // La ISS tiene fuente en vivo; el resto se propaga localmente
      if (stationId !== "iss") return getSgp4Position(stationId);
      try {
        const data = await fetchJson<WhereTheIssPosition>(
          "wheretheiss",
          `https://api.wheretheiss.at/v1/satellites/${station.noradId}?units=kilometers`,
        );
        return {
          noradId: station.noradId,
          name: data.name?.toUpperCase() === "ISS" ? "ISS" : data.name ?? "ISS",
          lat: data.latitude,
          lon: data.longitude,
          altitudeKm: data.altitude,
          velocityKmh: data.velocity,
          timestamp: data.timestamp * 1000,
          visibility: data.visibility === "eclipsed" ? "eclipsed" : "daylight",
          source: "wheretheiss" as const,
        };
      } catch {
        return getSgp4Position(stationId);
      }
    },
  );

  // Ángulos de observación: se calculan por pedido (dependen del observador,
  // no se cachean junto con la posición)
  if (!observer) return position;
  try {
    const tle = await getStationTle(stationId);
    const look = getLookAngles(
      tleToSatrec(tle.line1, tle.line2),
      observer,
      new Date(position.timestamp),
    );
    if (!look) return position;
    return {
      ...position,
      azimuthDeg: Math.round(look.azimuthDeg * 10) / 10,
      elevationDeg: Math.round(look.elevationDeg * 10) / 10,
    };
  } catch {
    // sin TLE no hay az/el, pero la posición sigue siendo válida
    return position;
  }
}

/** Compat con rutas existentes. */
export async function getIssPosition(): Promise<SatellitePosition> {
  return getStationPosition("iss");
}

// ---------------------------------------------------------------------------
// Ground track (pasado + futuro) calculado localmente con SGP4
// ---------------------------------------------------------------------------

export async function getStationTrack(
  stationId: StationId,
  pastMin: number,
  futureMin: number,
  stepSec: number,
): Promise<GroundTrack> {
  const station = STATIONS[stationId];
  // bucket de 5 minutos para que el cache sea efectivo entre usuarios
  const bucket = Math.floor(Date.now() / TRACK_TTL_MS);
  return getOrFetch<GroundTrack>(
    `track:${station.noradId}:${pastMin}:${futureMin}:${stepSec}:${bucket}`,
    TRACK_TTL_MS,
    async () => {
      const tle = await getStationTle(stationId);
      const satrec = tleToSatrec(tle.line1, tle.line2);
      const { past, future } = computeGroundTrack(satrec, {
        pastMinutes: pastMin,
        futureMinutes: futureMin,
        stepSeconds: stepSec,
      });
      return { noradId: station.noradId, past, future, generatedAt: Date.now() };
    },
  );
}

// ---------------------------------------------------------------------------
// Timezone por coordenadas (fallback cuando no hay WeatherAPI key)
// ---------------------------------------------------------------------------

export async function getTimezoneForCoords(lat: number, lon: number): Promise<string> {
  const key = `tz:${lat.toFixed(1)}:${lon.toFixed(1)}`;
  try {
    return await getOrFetch<string>(key, TIMEZONE_TTL_MS, async () => {
      const data = await fetchJson<WhereTheIssCoordinates>(
        "wheretheiss",
        `https://api.wheretheiss.at/v1/coordinates/${lat.toFixed(4)},${lon.toFixed(4)}`,
      );
      return data.timezone_id || "UTC";
    });
  } catch {
    return "UTC";
  }
}

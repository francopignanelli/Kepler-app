/**
 * Registro de estaciones espaciales y categorías del explorador.
 * Compartido entre cliente y servidor (no contiene secrets): acá viven los
 * NORAD IDs, los mapeos a categorías de N2YO y los colores de cada grupo.
 */

import type { SatCategoryId, SatCategoryInfo, StationId, StationInfo } from "@/types";

export const STATIONS: Record<StationId, StationInfo> = {
  iss: {
    id: "iss",
    name: "Estación Espacial Internacional",
    shortName: "ISS",
    noradId: 25544,
    color: "#5eead4",
  },
  tiangong: {
    id: "tiangong",
    name: "Tiangong (CSS)",
    shortName: "Tiangong",
    noradId: 48274,
    color: "#f59e0b",
  },
};

export const STATION_IDS = Object.keys(STATIONS) as StationId[];

export function isStationId(value: string): value is StationId {
  return value in STATIONS;
}

/**
 * Categorías de N2YO usadas por el explorador:
 * https://www.n2yo.com/api/ — sección "above".
 */
export const SAT_CATEGORIES: Record<SatCategoryId, SatCategoryInfo> = {
  starlink: { id: "starlink", n2yoId: 52, label: "Starlink", color: "#38bdf8" },
  gps: { id: "gps", n2yoId: 20, label: "GPS", color: "#a78bfa" },
  weather: { id: "weather", n2yoId: 3, label: "Meteorológicos", color: "#34d399" },
  amateur: { id: "amateur", n2yoId: 18, label: "Radioaficionados", color: "#f472b6" },
  earthobs: { id: "earthobs", n2yoId: 6, label: "Observación terrestre", color: "#fb923c" },
  all: { id: "all", n2yoId: 0, label: "Todos los satélites", color: "#94a3b8" },
};

export const SAT_CATEGORY_IDS = Object.keys(SAT_CATEGORIES) as SatCategoryId[];

/**
 * Cliente de servidor para WeatherAPI.com.
 * La API key vive solo acá (variable de entorno WEATHER_API_KEY); el frontend
 * consume /api/weather/* y recibe formas propias ya mapeadas y recortadas.
 */

import { getOrFetch } from "@/lib/cache";
import { getWeatherApiKey } from "@/lib/env";
import { fetchJson } from "@/server/http";
import { omGetCurrent, omGetForecast } from "@/server/openMeteo";
import { owmGetCurrent, owmGetForecast } from "@/server/openWeatherMap";
import type {
  AstroDay,
  CitySearchResult,
  CurrentWeather,
  ForecastDay,
  WeatherForecast,
  WeatherHour,
  WeatherLocation,
} from "@/types";

export class MissingApiKeyError extends Error {
  constructor(public readonly variable: string) {
    super(`Falta configurar ${variable}`);
    this.name = "MissingApiKeyError";
  }
}

const BASE = "https://api.weatherapi.com/v1";

const CURRENT_TTL_MS = 5 * 60_000;
const FORECAST_TTL_MS = 15 * 60_000;
const SEARCH_TTL_MS = 60 * 60_000;
const ASTRO_TTL_MS = 12 * 3600_000;

function requireKey(): string {
  const key = getWeatherApiKey();
  if (!key) throw new MissingApiKeyError("WEATHER_API_KEY");
  return key;
}

/** Redondeo de coordenadas para claves de cache (~1 km de precisión). */
function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function httpsIcon(icon: string | undefined): string {
  if (!icon) return "";
  return icon.startsWith("//") ? `https:${icon}` : icon;
}

// ---------------------------------------------------------------------------
// Tipos crudos de WeatherAPI (solo los campos que consumimos)
// ---------------------------------------------------------------------------

interface WaCondition {
  text: string;
  icon: string;
  code: number;
}

interface WaLocation {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  tz_id: string;
  localtime_epoch: number;
}

interface WaCurrent {
  temp_c: number;
  feelslike_c: number;
  condition: WaCondition;
  wind_kph: number;
  wind_dir: string;
  gust_kph: number;
  pressure_mb: number;
  precip_mm: number;
  humidity: number;
  cloud: number;
  is_day: number;
  vis_km: number;
  uv: number;
}

interface WaHour {
  time_epoch: number;
  time: string;
  temp_c: number;
  feelslike_c: number;
  condition: WaCondition;
  wind_kph: number;
  gust_kph: number;
  precip_mm: number;
  humidity: number;
  cloud: number;
  dewpoint_c: number;
  will_it_rain: number;
  chance_of_rain: number;
  will_it_snow: number;
  chance_of_snow: number;
  is_day: number;
  vis_km: number;
  uv: number;
}

interface WaAstro {
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moon_phase: string;
  moon_illumination: number | string;
  is_moon_up: number;
  is_sun_up: number;
}

interface WaForecastDay {
  date: string;
  date_epoch: number;
  day: {
    maxtemp_c: number;
    mintemp_c: number;
    avgtemp_c: number;
    condition: WaCondition;
    daily_chance_of_rain: number;
    totalprecip_mm: number;
    avgvis_km: number;
    avghumidity: number;
  };
  astro: WaAstro;
  hour: WaHour[];
}

interface WaForecastResponse {
  location: WaLocation;
  current: WaCurrent;
  forecast: { forecastday: WaForecastDay[] };
}

interface WaCurrentResponse {
  location: WaLocation;
  current: WaCurrent;
}

interface WaAstronomyResponse {
  location: WaLocation;
  astronomy: { astro: WaAstro };
}

interface WaSearchResult {
  id: number;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}

interface WaTimezoneResponse {
  location: WaLocation;
}

// ---------------------------------------------------------------------------
// Mapeos a tipos propios
// ---------------------------------------------------------------------------

function mapLocation(loc: WaLocation): WeatherLocation {
  return {
    name: loc.name,
    region: loc.region,
    country: loc.country,
    lat: loc.lat,
    lon: loc.lon,
    tzId: loc.tz_id,
    localtimeEpoch: loc.localtime_epoch,
  };
}

function mapCurrent(loc: WaLocation, cur: WaCurrent): CurrentWeather {
  return {
    location: mapLocation(loc),
    tempC: cur.temp_c,
    feelsLikeC: cur.feelslike_c,
    condition: cur.condition?.text ?? "",
    icon: httpsIcon(cur.condition?.icon),
    code: cur.condition?.code ?? 0,
    windKph: cur.wind_kph,
    windDir: cur.wind_dir,
    gustKph: cur.gust_kph,
    pressureMb: cur.pressure_mb,
    precipMm: cur.precip_mm,
    humidity: cur.humidity,
    cloud: cur.cloud,
    isDay: cur.is_day,
    visKm: cur.vis_km,
    uv: cur.uv,
    source: "weatherapi",
  };
}

function mapHour(h: WaHour): WeatherHour {
  return {
    timeEpoch: h.time_epoch,
    time: h.time,
    tempC: h.temp_c,
    feelsLikeC: h.feelslike_c,
    condition: h.condition?.text ?? "",
    icon: httpsIcon(h.condition?.icon),
    code: h.condition?.code ?? 0,
    windKph: h.wind_kph,
    gustKph: h.gust_kph,
    precipMm: h.precip_mm,
    humidity: h.humidity,
    cloud: h.cloud,
    dewpointC: h.dewpoint_c,
    willItRain: h.will_it_rain,
    chanceOfRain: h.chance_of_rain,
    willItSnow: h.will_it_snow,
    chanceOfSnow: h.chance_of_snow,
    isDay: h.is_day,
    visKm: h.vis_km,
    uv: h.uv,
  };
}

function mapAstro(a: WaAstro): AstroDay {
  return {
    sunrise: a.sunrise,
    sunset: a.sunset,
    moonrise: a.moonrise,
    moonset: a.moonset,
    moonPhase: a.moon_phase,
    moonIllumination: Number(a.moon_illumination ?? 0),
    isMoonUp: a.is_moon_up,
    isSunUp: a.is_sun_up,
  };
}

function mapForecastDay(d: WaForecastDay): ForecastDay {
  return {
    date: d.date,
    dateEpoch: d.date_epoch,
    maxTempC: d.day.maxtemp_c,
    minTempC: d.day.mintemp_c,
    avgTempC: d.day.avgtemp_c,
    condition: d.day.condition?.text ?? "",
    icon: httpsIcon(d.day.condition?.icon),
    dailyChanceOfRain: d.day.daily_chance_of_rain,
    totalPrecipMm: d.day.totalprecip_mm,
    avgVisKm: d.day.avgvis_km,
    avgHumidity: d.day.avghumidity,
    astro: mapAstro(d.astro),
    hours: d.hour.map(mapHour),
  };
}

// ---------------------------------------------------------------------------
// API pública del servicio
// ---------------------------------------------------------------------------

/**
 * Forecast con cadena de fuentes:
 * WeatherAPI (si hay key) → Open-Meteo (horario, sin key) → OpenWeatherMap
 * (si hay key; granularidad de 3 h, por eso va último).
 */
export async function getForecast(lat: number, lon: number, days: number): Promise<WeatherForecast> {
  return getOrFetch(`forecast:${coordKey(lat, lon)}:${days}`, FORECAST_TTL_MS, async () => {
    const key = getWeatherApiKey();
    if (key) {
      try {
        const url = `${BASE}/forecast.json?key=${key}&q=${lat},${lon}&days=${days}&aqi=yes&alerts=yes&lang=es`;
        const data = await fetchJson<WaForecastResponse>("weatherapi", url);
        return {
          location: mapLocation(data.location),
          current: mapCurrent(data.location, data.current),
          days: data.forecast.forecastday.map(mapForecastDay),
          source: "weatherapi" as const,
        };
      } catch (err) {
        console.error("[weather] WeatherAPI falló, siguiente fuente:", err instanceof Error ? err.message : err);
      }
    }
    try {
      return await omGetForecast(lat, lon, days);
    } catch (err) {
      console.error("[weather] Open-Meteo falló, probando OpenWeatherMap:", err instanceof Error ? err.message : err);
      return owmGetForecast(lat, lon, days);
    }
  });
}

/**
 * Clima actual: WeatherAPI (si hay key) → OpenWeatherMap (si hay key: trae
 * descripción en español e íconos propios) → Open-Meteo (siempre disponible).
 */
export async function getCurrent(lat: number, lon: number): Promise<CurrentWeather> {
  return getOrFetch(`current:${coordKey(lat, lon)}`, CURRENT_TTL_MS, async () => {
    const key = getWeatherApiKey();
    if (key) {
      try {
        const url = `${BASE}/current.json?key=${key}&q=${lat},${lon}&aqi=yes&lang=es`;
        const data = await fetchJson<WaCurrentResponse>("weatherapi", url);
        return mapCurrent(data.location, data.current);
      } catch (err) {
        console.error("[weather] WeatherAPI falló, siguiente fuente:", err instanceof Error ? err.message : err);
      }
    }
    try {
      return await owmGetCurrent(lat, lon);
    } catch {
      // sin OPENWEATHER_API_KEY (o key todavía no activada): Open-Meteo
      return omGetCurrent(lat, lon);
    }
  });
}

export async function getAstronomy(lat: number, lon: number, date: string): Promise<AstroDay> {
  const key = requireKey();
  return getOrFetch(`wa:astro:${coordKey(lat, lon)}:${date}`, ASTRO_TTL_MS, async () => {
    const url = `${BASE}/astronomy.json?key=${key}&q=${lat},${lon}&dt=${date}`;
    const data = await fetchJson<WaAstronomyResponse>("weatherapi", url);
    return mapAstro(data.astronomy.astro);
  });
}

export async function getTimezone(lat: number, lon: number): Promise<{ tzId: string; localtimeEpoch: number }> {
  const key = requireKey();
  return getOrFetch(`wa:tz:${coordKey(lat, lon)}`, ASTRO_TTL_MS, async () => {
    const url = `${BASE}/timezone.json?key=${key}&q=${lat},${lon}`;
    const data = await fetchJson<WaTimezoneResponse>("weatherapi", url);
    return { tzId: data.location.tz_id, localtimeEpoch: data.location.localtime_epoch };
  });
}

interface OpenMeteoGeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  /** jsonv2 usa "category"; el formato clásico usa "class" */
  category?: string;
  class?: string;
  type: string;
  address?: {
    suburb?: string;
    city?: string;
    town?: string;
    state?: string;
    county?: string;
    country?: string;
  };
}

/** Clases de resultado de Nominatim que tienen sentido como "lugar de observación". */
const NOMINATIM_PLACE_CLASSES = new Set(["place", "boundary"]);

/**
 * Geocoder primario: Nominatim (OpenStreetMap). A diferencia de los buscadores
 * de ciudades, conoce barrios y localidades (ej: "Palermo" encuentra el barrio
 * de Buenos Aires además de la ciudad italiana). Si se conoce la ubicación
 * actual del usuario, se sesgan los resultados hacia su zona (viewbox ±5°,
 * sin excluir el resto del mundo).
 */
async function searchNominatim(
  query: string,
  near?: { lat: number; lon: number },
): Promise<CitySearchResult[]> {
  let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=10&accept-language=es`;
  if (near) {
    const left = (near.lon - 5).toFixed(2);
    const right = (near.lon + 5).toFixed(2);
    const top = Math.min(90, near.lat + 5).toFixed(2);
    const bottom = Math.max(-90, near.lat - 5).toFixed(2);
    url += `&viewbox=${left},${top},${right},${bottom}&bounded=0`;
  }
  const data = await fetchJson<NominatimResult[]>("nominatim", url, {
    // la política de uso de Nominatim exige identificar la aplicación
    headers: { "User-Agent": "Kepler-ISS-Tracker/0.1 (proyecto educativo)" },
  });

  const results: CitySearchResult[] = [];
  const seen = new Set<string>();
  for (const r of data) {
    const category = r.category ?? r.class ?? "";
    if (!NOMINATIM_PLACE_CLASSES.has(category)) continue;
    const name = r.name || r.display_name.split(",")[0].trim();
    const region =
      r.address?.city ?? r.address?.town ?? r.address?.state ?? r.address?.county ?? "";
    const country = r.address?.country ?? "";
    const dedupeKey = `${name}|${region}|${country}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({
      id: `nm-${r.place_id}`,
      name,
      region,
      country,
      lat: Number(r.lat),
      lon: Number(r.lon),
    });
    if (results.length >= 8) break;
  }
  return results;
}

/**
 * Búsqueda de lugares con cadena de fuentes:
 * Nominatim (barrios y localidades, con sesgo hacia la zona del usuario)
 * → WeatherAPI Search (si hay key) → geocoding de Open-Meteo.
 * Siempre funciona sin configurar keys.
 */
export async function searchCity(
  query: string,
  near?: { lat: number; lon: number },
): Promise<CitySearchResult[]> {
  const nearKey = near ? `:${near.lat.toFixed(1)},${near.lon.toFixed(1)}` : "";
  const cacheId = `search:${query.toLowerCase()}${nearKey}`;

  return getOrFetch(cacheId, SEARCH_TTL_MS, async () => {
    try {
      const nominatim = await searchNominatim(query, near);
      if (nominatim.length > 0) return nominatim;
    } catch {
      // Nominatim caído o rate-limited: probamos las otras fuentes
    }

    const weatherKey = getWeatherApiKey();
    if (weatherKey) {
      try {
        const url = `${BASE}/search.json?key=${weatherKey}&q=${encodeURIComponent(query)}`;
        const data = await fetchJson<WaSearchResult[]>("weatherapi", url);
        return data.slice(0, 8).map((r) => ({
          id: `wa-${r.id}`,
          name: r.name,
          region: r.region,
          country: r.country,
          lat: r.lat,
          lon: r.lon,
        }));
      } catch {
        // seguimos a Open-Meteo
      }
    }

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=es&format=json`;
    const data = await fetchJson<{ results?: OpenMeteoGeoResult[] }>("open-meteo", url);
    return (data.results ?? []).map((r) => ({
      id: `om-${r.id}`,
      name: r.name,
      region: r.admin1 ?? "",
      country: r.country ?? "",
      lat: r.latitude,
      lon: r.longitude,
    }));
  });
}

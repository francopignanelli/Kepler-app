/**
 * Cliente de Open-Meteo (https://open-meteo.com): clima gratuito y sin API key.
 * Se usa como fuente de clima cuando no hay WEATHER_API_KEY configurada o
 * cuando WeatherAPI está caída, mapeando a los mismos tipos internos.
 *
 * Limitación conocida: Open-Meteo no publica datos lunares, así que los
 * campos de Luna quedan vacíos y el cálculo de visibilidad no aplica la
 * penalización lunar (documentado en README).
 */

import { azimuthToCompass } from "@/lib/geo";
import { formatTime } from "@/lib/time";
import { fetchJson } from "@/server/http";
import type {
  AstroDay,
  CurrentWeather,
  ForecastDay,
  WeatherForecast,
  WeatherHour,
  WeatherLocation,
} from "@/types";

const BASE = "https://api.open-meteo.com/v1/forecast";

/** Códigos de clima WMO → descripción en español */
const WMO_ES: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna intensa",
  56: "Llovizna helada ligera",
  57: "Llovizna helada intensa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  66: "Lluvia helada ligera",
  67: "Lluvia helada intensa",
  71: "Nevada ligera",
  73: "Nevada moderada",
  75: "Nevada intensa",
  77: "Granos de nieve",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos violentos",
  85: "Chubascos de nieve ligeros",
  86: "Chubascos de nieve intensos",
  95: "Tormenta",
  96: "Tormenta con granizo",
  99: "Tormenta con granizo fuerte",
};

function wmoText(code: number | undefined): string {
  return WMO_ES[code ?? -1] ?? "—";
}

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

interface OmCurrent {
  time: number;
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  cloud_cover: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  wind_direction_10m: number;
  is_day: number;
  pressure_msl: number;
}

interface OmHourly {
  time: number[];
  temperature_2m: number[];
  apparent_temperature: number[];
  relative_humidity_2m: number[];
  dew_point_2m: number[];
  precipitation: number[];
  precipitation_probability: (number | null)[];
  weather_code: number[];
  cloud_cover: number[];
  visibility: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  wind_direction_10m: number[];
  is_day: number[];
  uv_index: number[];
}

interface OmDaily {
  time: number[];
  sunrise: number[];
  sunset: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  precipitation_probability_max: (number | null)[];
  weather_code: number[];
}

interface OmForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: OmCurrent;
  hourly?: OmHourly;
  daily?: OmDaily;
}

function omLocation(data: OmForecastResponse, epoch: number): WeatherLocation {
  return {
    // Open-Meteo no geocodifica inverso: el nombre lo aporta la UI (ubicación elegida)
    name: "",
    region: "",
    country: "",
    lat: data.latitude,
    lon: data.longitude,
    tzId: data.timezone || "UTC",
    localtimeEpoch: epoch,
  };
}

function closestIndex(times: number[], target: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function mapOmCurrent(data: OmForecastResponse): CurrentWeather {
  const cur = data.current!;
  const hourly = data.hourly;
  const i = hourly ? closestIndex(hourly.time, cur.time) : -1;
  const visKm = hourly && i >= 0 ? (hourly.visibility[i] ?? 10_000) / 1000 : 10;
  const uv = hourly && i >= 0 ? hourly.uv_index[i] ?? 0 : 0;

  return {
    location: omLocation(data, cur.time),
    tempC: cur.temperature_2m,
    feelsLikeC: cur.apparent_temperature,
    condition: wmoText(cur.weather_code),
    icon: "",
    code: cur.weather_code,
    windKph: cur.wind_speed_10m,
    windDir: azimuthToCompass(cur.wind_direction_10m),
    gustKph: cur.wind_gusts_10m,
    pressureMb: cur.pressure_msl,
    precipMm: cur.precipitation,
    humidity: cur.relative_humidity_2m,
    cloud: cur.cloud_cover,
    isDay: cur.is_day,
    visKm: Math.round(visKm * 10) / 10,
    uv,
    source: "open-meteo",
  };
}

function mapOmHour(h: OmHourly, i: number): WeatherHour {
  const chanceOfRain = h.precipitation_probability[i] ?? 0;
  const code = h.weather_code[i];
  return {
    timeEpoch: h.time[i],
    time: "",
    tempC: h.temperature_2m[i],
    feelsLikeC: h.apparent_temperature[i],
    condition: wmoText(code),
    icon: "",
    code,
    windKph: h.wind_speed_10m[i],
    gustKph: h.wind_gusts_10m[i],
    precipMm: h.precipitation[i],
    humidity: h.relative_humidity_2m[i],
    cloud: h.cloud_cover[i],
    dewpointC: h.dew_point_2m[i],
    willItRain: chanceOfRain > 50 && !SNOW_CODES.has(code) ? 1 : 0,
    chanceOfRain,
    willItSnow: chanceOfRain > 50 && SNOW_CODES.has(code) ? 1 : 0,
    chanceOfSnow: SNOW_CODES.has(code) ? chanceOfRain : 0,
    isDay: h.is_day[i],
    visKm: Math.round(((h.visibility[i] ?? 10_000) / 1000) * 10) / 10,
    uv: h.uv_index[i] ?? 0,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mapOmDay(data: OmForecastResponse, dayIndex: number): ForecastDay {
  const daily = data.daily!;
  const hourly = data.hourly!;
  const tz = data.timezone || "UTC";
  const dayStart = daily.time[dayIndex];
  const dayEnd = dayStart + 86_400;

  const hours: WeatherHour[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i] >= dayStart && hourly.time[i] < dayEnd) {
      hours.push(mapOmHour(hourly, i));
    }
  }

  const astro: AstroDay = {
    sunrise: formatTime(daily.sunrise[dayIndex] * 1000, tz),
    sunset: formatTime(daily.sunset[dayIndex] * 1000, tz),
    moonrise: "",
    moonset: "",
    // Open-Meteo no provee datos lunares
    moonPhase: "",
    moonIllumination: 0,
    isMoonUp: 0,
    isSunUp: 0,
  };

  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(dayStart * 1000),
    dateEpoch: dayStart,
    maxTempC: daily.temperature_2m_max[dayIndex],
    minTempC: daily.temperature_2m_min[dayIndex],
    avgTempC: Math.round(mean(hours.map((h) => h.tempC)) * 10) / 10,
    condition: wmoText(daily.weather_code[dayIndex]),
    icon: "",
    dailyChanceOfRain: daily.precipitation_probability_max[dayIndex] ?? 0,
    totalPrecipMm: daily.precipitation_sum[dayIndex],
    avgVisKm: Math.round(mean(hours.map((h) => h.visKm)) * 10) / 10,
    avgHumidity: Math.round(mean(hours.map((h) => h.humidity))),
    astro,
    hours,
  };
}

const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "precipitation_probability",
  "weather_code",
  "cloud_cover",
  "visibility",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "is_day",
  "uv_index",
].join(",");

const DAILY_FIELDS = [
  "sunrise",
  "sunset",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "weather_code",
].join(",");

const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "is_day",
  "pressure_msl",
].join(",");

export async function omGetForecast(lat: number, lon: number, days: number): Promise<WeatherForecast> {
  const url =
    `${BASE}?latitude=${lat}&longitude=${lon}&timezone=auto&timeformat=unixtime` +
    `&forecast_days=${Math.min(days, 3)}&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}`;
  const data = await fetchJson<OmForecastResponse>("open-meteo", url);

  return {
    location: omLocation(data, data.current?.time ?? Math.floor(Date.now() / 1000)),
    current: mapOmCurrent(data),
    days: (data.daily?.time ?? []).map((_, i) => mapOmDay(data, i)),
    source: "open-meteo",
  };
}

export async function omGetCurrent(lat: number, lon: number): Promise<CurrentWeather> {
  const url =
    `${BASE}?latitude=${lat}&longitude=${lon}&timezone=auto&timeformat=unixtime` +
    `&forecast_days=1&current=${CURRENT_FIELDS}&hourly=visibility,uv_index,temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day`;
  const data = await fetchJson<OmForecastResponse>("open-meteo", url);
  return mapOmCurrent(data);
}

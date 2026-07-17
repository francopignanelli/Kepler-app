/**
 * Cliente de OpenWeatherMap (plan gratuito: endpoints 2.5).
 *
 * Del plan free aprovechamos:
 *  - Current Weather (/data/2.5/weather): clima actual con descripción en
 *    español e íconos propios.
 *  - Forecast 5 días / 3 horas (/data/2.5/forecast): pronóstico con nubosidad,
 *    visibilidad y probabilidad de precipitación (pop).
 *
 * One Call 3.0 NO está incluido en el plan free (requiere suscripción aparte),
 * por eso no se usa. La granularidad de 3 h es peor que la horaria de
 * Open-Meteo, así que OWM entra en la cadena como fuente de clima actual
 * (tiene íconos) y como último fallback del forecast.
 */

import { azimuthToCompass } from "@/lib/geo";
import { formatTime } from "@/lib/time";
import { getOpenWeatherApiKey } from "@/lib/env";
import { fetchJson, UpstreamError } from "@/server/http";
import type {
  AstroDay,
  CurrentWeather,
  ForecastDay,
  WeatherForecast,
  WeatherHour,
  WeatherLocation,
} from "@/types";

const BASE = "https://api.openweathermap.org/data/2.5";

function requireOwmKey(): string {
  const key = getOpenWeatherApiKey();
  if (!key) {
    throw new UpstreamError("openweathermap", null, "OPENWEATHER_API_KEY no configurada");
  }
  return key;
}

function owmIcon(icon: string | undefined): string {
  return icon ? `https://openweathermap.org/img/wn/${icon}@2x.png` : "";
}

interface OwmWeatherDescr {
  id: number;
  description: string;
  icon: string;
}

interface OwmCurrentResponse {
  coord: { lat: number; lon: number };
  weather: OwmWeatherDescr[];
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
    pressure: number;
  };
  visibility?: number;
  wind?: { speed: number; deg: number; gust?: number };
  clouds?: { all: number };
  rain?: { "1h"?: number };
  snow?: { "1h"?: number };
  dt: number;
  sys: { sunrise: number; sunset: number };
  name?: string;
}

interface OwmForecastItem {
  dt: number;
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  weather: OwmWeatherDescr[];
  clouds: { all: number };
  wind: { speed: number; deg: number; gust?: number };
  visibility?: number;
  /** probabilidad de precipitación 0-1 */
  pop?: number;
  rain?: { "3h"?: number };
  snow?: { "3h"?: number };
  sys: { pod: "d" | "n" };
}

interface OwmForecastResponse {
  list: OwmForecastItem[];
  city: {
    name?: string;
    country?: string;
    coord: { lat: number; lon: number };
    sunrise: number;
    sunset: number;
  };
}

const MS_TO_KMH = 3.6;

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function owmLocation(lat: number, lon: number, name: string | undefined, epoch: number): WeatherLocation {
  return {
    name: name ?? "",
    region: "",
    country: "",
    lat,
    lon,
    // OWM no informa el identificador IANA de timezone (solo offset)
    tzId: "UTC",
    localtimeEpoch: epoch,
  };
}

export async function owmGetCurrent(lat: number, lon: number): Promise<CurrentWeather> {
  const key = requireOwmKey();
  const url = `${BASE}/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=es`;
  const data = await fetchJson<OwmCurrentResponse>("openweathermap", url);

  const descr = data.weather?.[0];
  const isDay = data.dt >= data.sys.sunrise && data.dt < data.sys.sunset ? 1 : 0;

  return {
    location: owmLocation(data.coord.lat, data.coord.lon, data.name, data.dt),
    tempC: data.main.temp,
    feelsLikeC: data.main.feels_like,
    condition: capitalize(descr?.description ?? ""),
    icon: owmIcon(descr?.icon),
    code: descr?.id ?? 0,
    windKph: (data.wind?.speed ?? 0) * MS_TO_KMH,
    windDir: azimuthToCompass(data.wind?.deg ?? 0),
    gustKph: (data.wind?.gust ?? 0) * MS_TO_KMH,
    pressureMb: data.main.pressure,
    precipMm: data.rain?.["1h"] ?? data.snow?.["1h"] ?? 0,
    humidity: data.main.humidity,
    cloud: data.clouds?.all ?? 0,
    isDay,
    visKm: Math.round(((data.visibility ?? 10_000) / 1000) * 10) / 10,
    uv: 0, // el plan free 2.5 no incluye índice UV
    source: "openweathermap",
  };
}

function mapOwmItem(item: OwmForecastItem): WeatherHour {
  const descr = item.weather?.[0];
  const pop = Math.round((item.pop ?? 0) * 100);
  const rain3h = item.rain?.["3h"] ?? 0;
  const snow3h = item.snow?.["3h"] ?? 0;
  return {
    timeEpoch: item.dt,
    time: "",
    tempC: item.main.temp,
    feelsLikeC: item.main.feels_like,
    condition: capitalize(descr?.description ?? ""),
    icon: owmIcon(descr?.icon),
    code: descr?.id ?? 0,
    windKph: item.wind.speed * MS_TO_KMH,
    gustKph: (item.wind.gust ?? 0) * MS_TO_KMH,
    // el bloque es de 3 h: promedio horario aproximado
    precipMm: Math.round(((rain3h + snow3h) / 3) * 100) / 100,
    humidity: item.main.humidity,
    cloud: item.clouds.all,
    dewpointC: 0,
    willItRain: pop > 50 && rain3h >= snow3h ? 1 : 0,
    chanceOfRain: pop,
    willItSnow: pop > 50 && snow3h > rain3h ? 1 : 0,
    chanceOfSnow: snow3h > 0 ? pop : 0,
    isDay: item.sys.pod === "d" ? 1 : 0,
    visKm: Math.round(((item.visibility ?? 10_000) / 1000) * 10) / 10,
    uv: 0,
  };
}

export async function owmGetForecast(lat: number, lon: number, days: number): Promise<WeatherForecast> {
  const key = requireOwmKey();
  // 8 bloques de 3 h por día
  const cnt = Math.min(40, Math.max(8, days * 8));
  const url = `${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${key}&units=metric&lang=es&cnt=${cnt}`;
  const [forecast, current] = await Promise.all([
    fetchJson<OwmForecastResponse>("openweathermap", url),
    owmGetCurrent(lat, lon),
  ]);

  const hours = forecast.list.map(mapOwmItem);

  // agrupar bloques de 3 h por día UTC
  const byDay = new Map<string, WeatherHour[]>();
  for (const hour of hours) {
    const dayKey = new Date(hour.timeEpoch * 1000).toISOString().slice(0, 10);
    const bucket = byDay.get(dayKey) ?? [];
    bucket.push(hour);
    byDay.set(dayKey, bucket);
  }

  const astro: AstroDay = {
    sunrise: formatTime(forecast.city.sunrise * 1000, "UTC"),
    sunset: formatTime(forecast.city.sunset * 1000, "UTC"),
    moonrise: "",
    moonset: "",
    moonPhase: "",
    moonIllumination: 0,
    isMoonUp: 0,
    isSunUp: 0,
  };

  const daysList: ForecastDay[] = [...byDay.entries()].map(([date, dayHours]) => {
    const temps = dayHours.map((h) => h.tempC);
    return {
      date,
      dateEpoch: dayHours[0].timeEpoch,
      maxTempC: Math.max(...temps),
      minTempC: Math.min(...temps),
      avgTempC: Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10,
      condition: dayHours[Math.floor(dayHours.length / 2)].condition,
      icon: dayHours[Math.floor(dayHours.length / 2)].icon,
      dailyChanceOfRain: Math.max(...dayHours.map((h) => h.chanceOfRain)),
      totalPrecipMm:
        Math.round(dayHours.reduce((a, h) => a + h.precipMm * 3, 0) * 100) / 100,
      avgVisKm:
        Math.round((dayHours.reduce((a, h) => a + h.visKm, 0) / dayHours.length) * 10) / 10,
      avgHumidity: Math.round(dayHours.reduce((a, h) => a + h.humidity, 0) / dayHours.length),
      astro,
      hours: dayHours,
    };
  });

  return {
    location: owmLocation(
      forecast.city.coord.lat,
      forecast.city.coord.lon,
      forecast.city.name,
      Math.floor(Date.now() / 1000),
    ),
    current,
    days: daysList,
    source: "openweathermap",
  };
}

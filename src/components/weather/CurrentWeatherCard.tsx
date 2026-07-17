"use client";

import { Spinner } from "@/components/ui/Spinner";
import type { CurrentWeather } from "@/types";

interface CurrentWeatherCardProps {
  weather: CurrentWeather | null;
  error: string | null;
  unavailable: boolean;
  isLoading: boolean;
  hasLocation: boolean;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-star-500">{label}</span>
      <span className="telemetry text-sm text-star-100">{value}</span>
    </div>
  );
}

/** Clima actual de la ubicación del observador. */
export function CurrentWeatherCard({
  weather,
  error,
  unavailable,
  isLoading,
  hasLocation,
}: CurrentWeatherCardProps) {
  if (!hasLocation) {
    return (
      <div className="panel p-4 text-sm text-star-500">
        Elegí una ubicación para ver el clima local.
      </div>
    );
  }
  if (unavailable) {
    return (
      <div className="panel p-4 text-sm text-star-500">
        El clima no está configurado. Agregá <code className="telemetry text-xs">WEATHER_API_KEY</code> en{" "}
        <code className="telemetry text-xs">.env.local</code> para ver condiciones y calidad de observación.
      </div>
    );
  }
  if (error) {
    return <div className="panel p-4 text-sm text-danger-400">{error}</div>;
  }
  if (!weather || isLoading) {
    return (
      <div className="panel p-4">
        <Spinner label="Consultando clima…" />
      </div>
    );
  }

  return (
    <section className="panel p-4" aria-label="Clima actual">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-star-100">
            Clima actual
          </h2>
          {weather.location.name && (
            <p className="text-xs text-star-500">
              {weather.location.name}
              {weather.location.region ? `, ${weather.location.region}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {weather.icon && (
            // WeatherAPI sirve el ícono de condición ya adaptado día/noche
            // eslint-disable-next-line @next/next/no-img-element
            <img src={weather.icon} alt="" width={44} height={44} aria-hidden="true" />
          )}
          <span className="telemetry text-2xl font-semibold text-star-100">
            {Math.round(weather.tempC)}°
          </span>
        </div>
      </div>

      <p className="mb-3 text-sm text-star-300">{weather.condition}</p>

      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        <Metric label="Nubosidad" value={`${weather.cloud}%`} />
        <Metric label="Visibilidad" value={`${weather.visKm} km`} />
        <Metric label="Humedad" value={`${weather.humidity}%`} />
        <Metric label="Viento" value={`${Math.round(weather.windKph)} km/h ${weather.windDir}`} />
        <Metric label="Sensación" value={`${Math.round(weather.feelsLikeC)}°`} />
        <Metric label="UV" value={String(weather.uv)} />
      </div>

      {weather.source === "open-meteo" && (
        <p className="mt-3 text-[10px] text-star-700">Datos: Open-Meteo (sin API key)</p>
      )}
      {weather.source === "openweathermap" && (
        <p className="mt-3 text-[10px] text-star-700">Datos: OpenWeatherMap</p>
      )}
    </section>
  );
}

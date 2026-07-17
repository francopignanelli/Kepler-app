"use client";

import { useEffect, useState } from "react";
import { ApiClientError } from "@/services/apiClient";
import { weatherService } from "@/services/weatherService";
import type { CurrentWeather, UserLocation } from "@/types";

const REFRESH_MS = 10 * 60_000;

/** Clima actual de la ubicación del usuario (si hay WEATHER_API_KEY). */
export function useCurrentWeather(location: UserLocation | null) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!location) {
      setWeather(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const data = await weatherService.getCurrent(location.lat, location.lon);
        if (!cancelled) {
          setWeather(data);
          setError(null);
          setUnavailable(false);
        }
      } catch (err) {
        if (cancelled) return;
        setWeather(null);
        if (err instanceof ApiClientError && err.code === "MISSING_API_KEY") {
          setUnavailable(true);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Error al obtener el clima");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [location]);

  return { weather, error, unavailable, isLoading };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { passesService } from "@/services/passesService";
import type { PassesResponse, UserLocation } from "@/types";

/** Próximas pasadas para la ubicación seleccionada. */
export function usePasses(location: UserLocation | null, days = 3) {
  const [data, setData] = useState<PassesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!location) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await passesService.getNextPasses(location.lat, location.lon, days);
      setData(response);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Error al calcular las pasadas");
    } finally {
      setIsLoading(false);
    }
  }, [location, days]);

  useEffect(() => {
    setData(null);
    if (location) load();
  }, [location, load]);

  return { data, error, isLoading, reload: load };
}

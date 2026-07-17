"use client";

import { useCallback, useEffect, useState } from "react";
import { locationService } from "@/services/locationService";
import type { CitySearchResult, UserLocation } from "@/types";

/**
 * Ubicación del observador: geolocalización (solo ante gesto del usuario),
 * búsqueda manual de ciudad, última ubicación y favoritos en localStorage.
 */
export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [favorites, setFavorites] = useState<UserLocation[]>([]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // hidratar desde localStorage al montar (evita mismatch SSR/cliente)
  useEffect(() => {
    setLocation(locationService.getLastLocation());
    setFavorites(locationService.getFavorites());
  }, []);

  const applyLocation = useCallback((loc: UserLocation) => {
    setLocation(loc);
    locationService.saveLastLocation(loc);
    setGeoError(null);
  }, []);

  const useBrowserLocation = useCallback(async () => {
    setIsLocating(true);
    setGeoError(null);
    try {
      const loc = await locationService.getBrowserLocation();
      applyLocation(loc);
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : "Error de geolocalización");
    } finally {
      setIsLocating(false);
    }
  }, [applyLocation]);

  const selectCity = useCallback(
    (city: CitySearchResult) => {
      applyLocation(locationService.cityToLocation(city));
    },
    [applyLocation],
  );

  const addFavorite = useCallback((loc: UserLocation) => {
    setFavorites(locationService.saveFavoriteLocation(loc));
  }, []);

  const removeFavorite = useCallback((loc: UserLocation) => {
    setFavorites(locationService.removeFavoriteLocation(loc));
  }, []);

  const isFavorite = useCallback(
    (loc: UserLocation | null) =>
      loc !== null &&
      favorites.some(
        (f) => Math.abs(f.lat - loc.lat) < 0.01 && Math.abs(f.lon - loc.lon) < 0.01,
      ),
    [favorites],
  );

  return {
    location,
    favorites,
    geoError,
    isLocating,
    useBrowserLocation,
    selectCity,
    applyLocation,
    addFavorite,
    removeFavorite,
    isFavorite,
  };
}

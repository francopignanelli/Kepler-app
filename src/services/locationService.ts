import { userLocationSchema } from "@/schemas";
import { weatherService } from "@/services/weatherService";
import { storageGet, storageSet, STORAGE_KEYS } from "@/services/storage";
import type { CitySearchResult, UserLocation } from "@/types";

const MAX_FAVORITES = 8;

export const locationService = {
  /**
   * Geolocalización del navegador. Solo se invoca ante un gesto explícito
   * del usuario (botón "Usar mi ubicación"): nunca al cargar la página.
   */
  getBrowserLocation(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Tu navegador no soporta geolocalización"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracyM = position.coords.accuracy;
          resolve({
            name: "Mi ubicación",
            lat: Math.round(position.coords.latitude * 10000) / 10000,
            lon: Math.round(position.coords.longitude * 10000) / 10000,
            source: "geolocation",
            // accuracy en metros → km; se dibuja como rango en el globo
            accuracyKm:
              Number.isFinite(accuracyM) && accuracyM > 0
                ? Math.min(1000, Math.max(0.01, accuracyM / 1000))
                : undefined,
          });
        },
        (error) => {
          const messages: Record<number, string> = {
            1: "Permiso de ubicación denegado. Podés buscar tu ciudad manualmente.",
            2: "No se pudo determinar tu ubicación. Probá buscando tu ciudad.",
            3: "La geolocalización tardó demasiado. Probá buscando tu ciudad.",
          };
          reject(new Error(messages[error.code] ?? "Error de geolocalización"));
        },
        // alta precisión (GPS si está disponible) y cache corto: el punto
        // debe reflejar dónde está el usuario ahora, no hace 5 minutos
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      );
    });
  },

  searchCity(query: string, near?: { lat: number; lon: number }): Promise<CitySearchResult[]> {
    return weatherService.searchLocation(query, near);
  },

  cityToLocation(city: CitySearchResult): UserLocation {
    return {
      name: city.name,
      region: city.region,
      country: city.country,
      lat: city.lat,
      lon: city.lon,
      source: "search",
      // una búsqueda apunta a una zona, no a una coordenada exacta:
      // radio aproximado de un barrio / ciudad chica
      accuracyKm: 3,
    };
  },

  getLastLocation(): UserLocation | null {
    const stored = storageGet<UserLocation | null>(STORAGE_KEYS.lastLocation, null);
    if (!stored) return null;
    const parsed = userLocationSchema.safeParse(stored);
    return parsed.success ? (parsed.data as UserLocation) : null;
  },

  saveLastLocation(location: UserLocation): void {
    storageSet(STORAGE_KEYS.lastLocation, location);
  },

  getFavorites(): UserLocation[] {
    const stored = storageGet<UserLocation[]>(STORAGE_KEYS.favoriteLocations, []);
    return stored.filter((l) => userLocationSchema.safeParse(l).success);
  },

  saveFavoriteLocation(location: UserLocation): UserLocation[] {
    const favorites = locationService.getFavorites();
    const exists = favorites.some(
      (f) => Math.abs(f.lat - location.lat) < 0.01 && Math.abs(f.lon - location.lon) < 0.01,
    );
    if (exists) return favorites;
    const updated = [location, ...favorites].slice(0, MAX_FAVORITES);
    storageSet(STORAGE_KEYS.favoriteLocations, updated);
    return updated;
  },

  removeFavoriteLocation(location: UserLocation): UserLocation[] {
    const favorites = locationService.getFavorites();
    const updated = favorites.filter(
      (f) => !(Math.abs(f.lat - location.lat) < 0.01 && Math.abs(f.lon - location.lon) < 0.01),
    );
    storageSet(STORAGE_KEYS.favoriteLocations, updated);
    return updated;
  },
};

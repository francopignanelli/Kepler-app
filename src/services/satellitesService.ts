import { apiFetch } from "@/services/apiClient";
import type { GeoPoint, SatCategoryId, SatellitesAbove } from "@/types";

export const satellitesService = {
  /** Satélites sobre el observador para una categoría (proxy de N2YO). */
  getAbove(
    observer: GeoPoint,
    category: SatCategoryId,
    radiusDeg = 90,
  ): Promise<SatellitesAbove> {
    const params = new URLSearchParams({
      lat: String(observer.lat),
      lon: String(observer.lon),
      category,
      radius: String(radiusDeg),
    });
    return apiFetch<SatellitesAbove>(`/api/satellites/above?${params}`);
  },
};

import { apiFetch } from "@/services/apiClient";
import type { GeoPoint, GroundTrack, SatellitePosition, StationId, Tle } from "@/types";

export const issService = {
  /**
   * Posición actual de una estación. Con `observer` el servidor agrega
   * azimut y elevación vistos desde esa ubicación.
   */
  getStationPosition(stationId: StationId, observer?: GeoPoint | null): Promise<SatellitePosition> {
    const params = new URLSearchParams({ sat: stationId });
    if (observer) {
      params.set("lat", String(observer.lat));
      params.set("lon", String(observer.lon));
    }
    return apiFetch<SatellitePosition>(`/api/iss/position?${params}`);
  },

  getStationTrack(
    stationId: StationId,
    pastMin = 90,
    futureMin = 90,
    stepSec = 30,
  ): Promise<GroundTrack> {
    const params = new URLSearchParams({
      sat: stationId,
      pastMin: String(pastMin),
      futureMin: String(futureMin),
      stepSec: String(stepSec),
    });
    return apiFetch<GroundTrack>(`/api/iss/track?${params}`);
  },

  getTLE(stationId: StationId = "iss"): Promise<Tle> {
    return apiFetch<Tle>(`/api/iss/tle?sat=${stationId}`);
  },
};

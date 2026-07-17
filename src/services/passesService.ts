import { apiFetch } from "@/services/apiClient";
import type { PassesResponse } from "@/types";

export const passesService = {
  getNextPasses(lat: number, lon: number, days = 3): Promise<PassesResponse> {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      days: String(days),
    });
    return apiFetch<PassesResponse>(`/api/passes?${params}`);
  },
};

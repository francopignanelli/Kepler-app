import { apiFetch } from "@/services/apiClient";
import type { AstroDay, CitySearchResult, CurrentWeather, WeatherForecast } from "@/types";

export const weatherService = {
  getCurrent(lat: number, lon: number): Promise<CurrentWeather> {
    return apiFetch<CurrentWeather>(`/api/weather/current?lat=${lat}&lon=${lon}`);
  },

  getForecast(lat: number, lon: number, days = 2): Promise<WeatherForecast> {
    return apiFetch<WeatherForecast>(`/api/weather/forecast?lat=${lat}&lon=${lon}&days=${days}`);
  },

  getAstronomy(lat: number, lon: number, date: string): Promise<AstroDay> {
    return apiFetch<AstroDay>(`/api/weather/astronomy?lat=${lat}&lon=${lon}&date=${date}`);
  },

  searchLocation(query: string, near?: { lat: number; lon: number }): Promise<CitySearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (near) {
      params.set("lat", near.lat.toFixed(4));
      params.set("lon", near.lon.toFixed(4));
    }
    return apiFetch<CitySearchResult[]>(`/api/weather/search?${params}`);
  },

  getTimezone(lat: number, lon: number): Promise<{ tzId: string; localtimeEpoch: number }> {
    return apiFetch(`/api/weather/timezone?lat=${lat}&lon=${lon}`);
  },
};

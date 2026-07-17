/**
 * Acceso seguro a localStorage: nunca lanza (modo privado, SSR, quota).
 * Las preferencias del usuario se guardan SOLO en su dispositivo.
 */

export function storageGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota o modo privado: preferencias no persisten, la app sigue
  }
}

export function storageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignorar
  }
}

export const STORAGE_KEYS = {
  lastLocation: "kepler:last-location",
  favoriteLocations: "kepler:favorite-locations",
  notificationPreferences: "kepler:notification-preferences",
  scheduledAlerts: "kepler:scheduled-alerts",
  layerVisibility: "kepler:layer-visibility",
  stationSelection: "kepler:station-selection",
  satelliteFilters: "kepler:satellite-filters",
} as const;

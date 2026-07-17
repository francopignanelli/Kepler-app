/**
 * Utilidades geográficas puras (sin dependencias de UI ni de red).
 */

export function isValidLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLon(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** Normaliza una longitud a [-180, 180] */
export function normalizeLon(lon: number): number {
  let l = lon % 360;
  if (l > 180) l -= 360;
  if (l < -180) l += 360;
  return l;
}

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
] as const;

const COMPASS_NAMES: Record<string, string> = {
  N: "Norte", NNE: "Nornoreste", NE: "Noreste", ENE: "Estenoreste",
  E: "Este", ESE: "Estesureste", SE: "Sureste", SSE: "Sursureste",
  S: "Sur", SSO: "Sursuroeste", SO: "Suroeste", OSO: "Oestesuroeste",
  O: "Oeste", ONO: "Oestenoroeste", NO: "Noroeste", NNO: "Nornoroeste",
};

/** Convierte un azimut en grados (0 = Norte, horario) a punto cardinal es-AR. */
export function azimuthToCompass(azimuthDeg: number): string {
  const az = ((azimuthDeg % 360) + 360) % 360;
  const index = Math.round(az / 22.5) % 16;
  return COMPASS_16[index];
}

export function compassLongName(compass: string): string {
  return COMPASS_NAMES[compass] ?? compass;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Formatea coordenadas al estilo instrumental: 34.6037° S, 58.3816° O */
export function formatCoords(lat: number, lon: number, decimals = 4): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lonHem = lon >= 0 ? "E" : "O";
  return `${Math.abs(lat).toFixed(decimals)}° ${latHem}, ${Math.abs(lon).toFixed(decimals)}° ${lonHem}`;
}

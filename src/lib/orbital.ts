/**
 * Motor orbital de Kepler.
 *
 * Toda la matemática orbital vive acá, aislada de la UI:
 *  - Propagación SGP4 desde TLE (satellite.js).
 *  - Ground track pasado/futuro.
 *  - Punto subsolar (para la capa día/noche del globo).
 *  - Predicción de pasadas sobre un observador, con test de visibilidad real:
 *    observador en oscuridad (Sol < -6°) + ISS iluminada por el Sol
 *    (fracción de sombra terrestre calculada por satellite.js).
 */

import {
  twoline2satrec,
  propagate,
  gstime,
  jday,
  sunPos,
  shadowFraction,
  eciToGeodetic,
  eciToEcf,
  ecfToLookAngles,
  degreesLat,
  degreesLong,
  degreesToRadians,
  radiansToDegrees,
  type SatRec,
  type EciVec3,
  type Kilometer,
} from "satellite.js";
import { azimuthToCompass, normalizeLon } from "@/lib/geo";
import type { GroundTrackPoint } from "@/types";

const AU_KM = 149_597_870.7;

/** Sol por debajo de -6° = fin del crepúsculo civil: el cielo ya está oscuro
 *  como para distinguir la ISS. */
const OBSERVER_DARK_SUN_ELEVATION_DEG = -6;

/** Umbral de sombra: < 0.5 significa que más de la mitad del disco solar
 *  ilumina a la ISS, suficiente para que brille. */
const SUNLIT_SHADOW_THRESHOLD = 0.5;

export interface ObserverGeo {
  lat: number;
  lon: number;
  /** altitud del observador en km, default 0 */
  altKm?: number;
}

export interface RawPass {
  startTime: Date;
  peakTime: Date;
  endTime: Date;
  durationSeconds: number;
  maxElevationDeg: number;
  startAzimuthDeg: number;
  endAzimuthDeg: number;
  /** true si en algún tramo la pasada es visible a simple vista */
  isVisible: boolean;
  /** magnitud visual estimada en el pico (solo si es visible) */
  magnitude: number | null;
}

export function tleToSatrec(line1: string, line2: string): SatRec {
  return twoline2satrec(line1, line2);
}

export interface SatSnapshot {
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  sunlit: boolean;
}

/** Posición geodésica + velocidad + iluminación del satélite en un instante. */
export function getSatSnapshot(satrec: SatRec, date: Date): SatSnapshot | null {
  const pv = propagate(satrec, date);
  if (!pv || !pv.position || !pv.velocity) return null;

  const gmst = gstime(date);
  const geo = eciToGeodetic(pv.position, gmst);
  const v = pv.velocity;
  const speedKms = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  return {
    lat: degreesLat(geo.latitude),
    lon: normalizeLon(degreesLong(geo.longitude)),
    altitudeKm: geo.height,
    velocityKmh: speedKms * 3600,
    sunlit: isEciSunlit(pv.position, date),
  };
}

/** true si el satélite recibe luz solar (no está en la sombra de la Tierra). */
export function isEciSunlit(satEciKm: EciVec3<Kilometer>, date: Date): boolean {
  const { rsun } = sunPos(jday(date));
  return shadowFraction(rsun, satEciKm) < SUNLIT_SHADOW_THRESHOLD;
}

/** Punto subsolar: latitud/longitud donde el Sol está en el cénit. */
export function getSubsolarPoint(date: Date): { lat: number; lon: number } {
  const { rsun } = sunPos(jday(date));
  const sunEciKm = { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM };
  const gmst = gstime(date);
  const geo = eciToGeodetic(sunEciKm, gmst);
  return { lat: degreesLat(geo.latitude), lon: normalizeLon(degreesLong(geo.longitude)) };
}

/** Elevación del Sol sobre el horizonte del observador, en grados. */
export function getSunElevationDeg(observer: ObserverGeo, date: Date): number {
  const { rsun } = sunPos(jday(date));
  const sunEciKm = { x: rsun.x * AU_KM, y: rsun.y * AU_KM, z: rsun.z * AU_KM };
  const gmst = gstime(date);
  const sunEcf = eciToEcf(sunEciKm, gmst);
  const observerGd = {
    latitude: degreesToRadians(observer.lat),
    longitude: degreesToRadians(observer.lon),
    height: observer.altKm ?? 0,
  };
  const look = ecfToLookAngles(observerGd, sunEcf);
  return radiansToDegrees(look.elevation);
}

/** Azimut y elevación del satélite vistos desde el observador. */
export function getLookAngles(
  satrec: SatRec,
  observer: ObserverGeo,
  date: Date,
): { azimuthDeg: number; elevationDeg: number; rangeKm: number } | null {
  const sample = lookAt(satrec, observerToGd(observer), date);
  if (!sample) return null;
  return {
    azimuthDeg: sample.azimuthDeg,
    elevationDeg: sample.elevationDeg,
    rangeKm: sample.rangeKm,
  };
}

export interface GroundTrackOptions {
  /** minutos hacia atrás desde `now` */
  pastMinutes?: number;
  /** minutos hacia adelante desde `now` */
  futureMinutes?: number;
  stepSeconds?: number;
  now?: Date;
}

export function computeGroundTrack(
  satrec: SatRec,
  options: GroundTrackOptions = {},
): { past: GroundTrackPoint[]; future: GroundTrackPoint[] } {
  const { pastMinutes = 90, futureMinutes = 90, stepSeconds = 30, now = new Date() } = options;

  const sample = (fromMs: number, toMs: number): GroundTrackPoint[] => {
    const points: GroundTrackPoint[] = [];
    for (let t = fromMs; t <= toMs; t += stepSeconds * 1000) {
      const snap = getSatSnapshot(satrec, new Date(t));
      if (snap) {
        points.push({ lat: snap.lat, lon: snap.lon, altitudeKm: snap.altitudeKm, timestamp: t });
      }
    }
    return points;
  };

  const nowMs = now.getTime();
  return {
    past: sample(nowMs - pastMinutes * 60_000, nowMs),
    future: sample(nowMs, nowMs + futureMinutes * 60_000),
  };
}

export interface PredictPassesOptions {
  startDate?: Date;
  days?: number;
  /** elevación mínima para considerar que hay pasada */
  minElevationDeg?: number;
  stepSeconds?: number;
}

interface LookSample {
  time: Date;
  elevationDeg: number;
  azimuthDeg: number;
  rangeKm: number;
  eci: EciVec3<Kilometer> | null;
}

function lookAt(satrec: SatRec, observerGd: ReturnType<typeof observerToGd>, date: Date): LookSample | null {
  const pv = propagate(satrec, date);
  if (!pv || !pv.position) return null;
  const gmst = gstime(date);
  const satEcf = eciToEcf(pv.position, gmst);
  const look = ecfToLookAngles(observerGd, satEcf);
  return {
    time: date,
    elevationDeg: radiansToDegrees(look.elevation),
    azimuthDeg: radiansToDegrees(look.azimuth),
    rangeKm: look.rangeSat,
    eci: pv.position,
  };
}

function observerToGd(observer: ObserverGeo) {
  return {
    latitude: degreesToRadians(observer.lat),
    longitude: degreesToRadians(observer.lon),
    height: observer.altKm ?? 0,
  };
}

/**
 * Magnitud visual aproximada de la ISS según distancia (fórmula tipo
 * Heavens-Above: mag estándar -1.8 a 1000 km). Solo orientativa.
 */
function estimateMagnitude(rangeKm: number): number {
  const mag = -1.8 + 5 * Math.log10(Math.max(200, rangeKm) / 1000);
  return Math.round(mag * 10) / 10;
}

/**
 * Predice pasadas del satélite sobre el observador.
 * Barrido con paso fijo (default 10 s): resolución más que suficiente para
 * mostrar horarios al minuto, con costo ~26k propagaciones por 3 días.
 */
export function predictPasses(
  satrec: SatRec,
  observer: ObserverGeo,
  options: PredictPassesOptions = {},
): RawPass[] {
  const {
    startDate = new Date(),
    days = 3,
    minElevationDeg = 10,
    stepSeconds = 10,
  } = options;

  const observerGd = observerToGd(observer);
  const endMs = startDate.getTime() + days * 86_400_000;
  const stepMs = stepSeconds * 1000;

  const passes: RawPass[] = [];

  let inPass = false;
  let passSamples: LookSample[] = [];

  const flushPass = () => {
    if (passSamples.length < 2) {
      passSamples = [];
      return;
    }
    const first = passSamples[0];
    const last = passSamples[passSamples.length - 1];
    let peak = first;
    for (const s of passSamples) {
      if (s.elevationDeg > peak.elevationDeg) peak = s;
    }

    // Visibilidad real: observador a oscuras + ISS iluminada, en >= 2 muestras
    let visibleSamples = 0;
    for (const s of passSamples) {
      if (!s.eci) continue;
      const sunElev = getSunElevationDeg(observer, s.time);
      if (sunElev < OBSERVER_DARK_SUN_ELEVATION_DEG && isEciSunlit(s.eci, s.time)) {
        visibleSamples += 1;
        if (visibleSamples >= 2) break;
      }
    }
    const isVisible = visibleSamples >= 2;

    passes.push({
      startTime: first.time,
      peakTime: peak.time,
      endTime: last.time,
      durationSeconds: (last.time.getTime() - first.time.getTime()) / 1000,
      maxElevationDeg: Math.round(peak.elevationDeg),
      startAzimuthDeg: first.azimuthDeg,
      endAzimuthDeg: last.azimuthDeg,
      isVisible,
      magnitude: isVisible ? estimateMagnitude(peak.rangeKm) : null,
    });
    passSamples = [];
  };

  for (let t = startDate.getTime(); t <= endMs; t += stepMs) {
    const sample = lookAt(satrec, observerGd, new Date(t));
    if (!sample) continue;

    if (sample.elevationDeg >= minElevationDeg) {
      inPass = true;
      passSamples.push(sample);
    } else if (inPass) {
      inPass = false;
      flushPass();
    }
  }
  if (inPass) flushPass();

  return passes;
}

/** Convierte un RawPass a la forma serializable que expone la API. */
export function rawPassToSatellitePass(pass: RawPass) {
  return {
    startTime: pass.startTime.toISOString(),
    peakTime: pass.peakTime.toISOString(),
    endTime: pass.endTime.toISOString(),
    durationMinutes: Math.round((pass.durationSeconds / 60) * 10) / 10,
    maxElevation: pass.maxElevationDeg,
    startAzimuth: Math.round(pass.startAzimuthDeg),
    endAzimuth: Math.round(pass.endAzimuthDeg),
    startDirection: azimuthToCompass(pass.startAzimuthDeg),
    endDirection: azimuthToCompass(pass.endAzimuthDeg),
    magnitude: pass.magnitude,
    isVisible: pass.isVisible,
  };
}

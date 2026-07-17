import { describe, expect, it } from "vitest";
import {
  computeGroundTrack,
  getSubsolarPoint,
  getSunElevationDeg,
  getSatSnapshot,
  predictPasses,
  rawPassToSatellitePass,
  tleToSatrec,
} from "@/lib/orbital";

/**
 * TLE real de la ISS (CelesTrak, época 2024-11-20).
 * Los tests propagan cerca de la época del TLE para que SGP4 sea preciso.
 */
const TLE_LINE_1 = "1 25544U 98067A   24325.54761574  .00018705  00000+0  33390-3 0  9994";
const TLE_LINE_2 = "2 25544  51.6398 300.3489 0007209  56.5906  47.3234 15.50067047483466";
const EPOCH = new Date(Date.UTC(2024, 10, 20, 13, 8, 34));

describe("getSatSnapshot", () => {
  it("propaga a una órbita físicamente plausible para la ISS", () => {
    const satrec = tleToSatrec(TLE_LINE_1, TLE_LINE_2);
    const snap = getSatSnapshot(satrec, EPOCH);
    expect(snap).not.toBeNull();
    // altitud LEO de la ISS
    expect(snap!.altitudeKm).toBeGreaterThan(350);
    expect(snap!.altitudeKm).toBeLessThan(470);
    // velocidad orbital ~27.500 km/h
    expect(snap!.velocityKmh).toBeGreaterThan(26_000);
    expect(snap!.velocityKmh).toBeLessThan(29_000);
    // inclinación 51.6°: la latitud nunca la supera
    expect(Math.abs(snap!.lat)).toBeLessThanOrEqual(52);
    expect(Math.abs(snap!.lon)).toBeLessThanOrEqual(180);
  });
});

describe("getSubsolarPoint", () => {
  it("la declinación solar queda dentro de ±23.5°", () => {
    for (const date of [
      new Date(Date.UTC(2024, 10, 20)),
      new Date(Date.UTC(2024, 5, 21)),
      new Date(Date.UTC(2024, 11, 21)),
    ]) {
      const { lat, lon } = getSubsolarPoint(date);
      expect(Math.abs(lat)).toBeLessThanOrEqual(23.6);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    }
  });

  it("en el solsticio de diciembre el Sol está sobre el hemisferio sur", () => {
    const { lat } = getSubsolarPoint(new Date(Date.UTC(2024, 11, 21, 12)));
    expect(lat).toBeLessThan(-23);
    expect(lat).toBeGreaterThan(-24);
  });
});

describe("getSunElevationDeg", () => {
  it("mediodía en Buenos Aires (UTC-3): Sol alto; medianoche: Sol bajo el horizonte", () => {
    const observer = { lat: -34.6037, lon: -58.3816 };
    const noonLocal = new Date(Date.UTC(2024, 11, 21, 15, 0, 0)); // 12:00 hora local
    const midnightLocal = new Date(Date.UTC(2024, 11, 21, 3, 0, 0)); // 00:00 hora local
    expect(getSunElevationDeg(observer, noonLocal)).toBeGreaterThan(60);
    expect(getSunElevationDeg(observer, midnightLocal)).toBeLessThan(-20);
  });
});

describe("computeGroundTrack", () => {
  it("genera puntos pasados y futuros continuos", () => {
    const satrec = tleToSatrec(TLE_LINE_1, TLE_LINE_2);
    const { past, future } = computeGroundTrack(satrec, {
      pastMinutes: 30,
      futureMinutes: 30,
      stepSeconds: 60,
      now: EPOCH,
    });
    expect(past.length).toBeGreaterThanOrEqual(30);
    expect(future.length).toBeGreaterThanOrEqual(30);
    // timestamps ordenados
    for (let i = 1; i < future.length; i++) {
      expect(future[i].timestamp).toBeGreaterThan(future[i - 1].timestamp);
    }
  });
});

describe("predictPasses", () => {
  it("encuentra pasadas sobre Buenos Aires cerca de la época del TLE", () => {
    const satrec = tleToSatrec(TLE_LINE_1, TLE_LINE_2);
    const passes = predictPasses(
      satrec,
      { lat: -34.6037, lon: -58.3816 },
      { startDate: EPOCH, days: 2, minElevationDeg: 10 },
    );

    // la ISS pasa sobre Buenos Aires varias veces en 2 días
    expect(passes.length).toBeGreaterThan(3);

    for (const pass of passes) {
      expect(pass.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(pass.maxElevationDeg).toBeLessThanOrEqual(90);
      // duración razonable de una pasada LEO sobre 10°
      expect(pass.durationSeconds).toBeGreaterThan(30);
      expect(pass.durationSeconds).toBeLessThan(15 * 60);
      // orden temporal interno
      expect(pass.peakTime.getTime()).toBeGreaterThanOrEqual(pass.startTime.getTime());
      expect(pass.endTime.getTime()).toBeGreaterThanOrEqual(pass.peakTime.getTime());
      // pasadas visibles llevan magnitud estimada
      if (pass.isVisible) expect(pass.magnitude).not.toBeNull();
    }
  });

  it("serializa a la forma de la API con direcciones cardinales", () => {
    const satrec = tleToSatrec(TLE_LINE_1, TLE_LINE_2);
    const [first] = predictPasses(
      satrec,
      { lat: -34.6037, lon: -58.3816 },
      { startDate: EPOCH, days: 1 },
    );
    const serialized = rawPassToSatellitePass(first);
    expect(serialized.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(serialized.startDirection).toMatch(/^[NSEO]{1,3}$/);
    expect(serialized.endDirection).toMatch(/^[NSEO]{1,3}$/);
    expect(serialized.durationMinutes).toBeGreaterThan(0);
  });
});

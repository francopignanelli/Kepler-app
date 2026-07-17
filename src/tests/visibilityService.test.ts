import { describe, expect, it } from "vitest";
import {
  buildRecommendation,
  calculateGeometryOnlyScore,
  calculateISSObservationScore,
  calculateSkyVisibility,
  getSkyVisibilityLabel,
  getSkyVisibilityMessage,
} from "@/services/visibilityService";

describe("calculateSkyVisibility", () => {
  it("da 100 en una noche perfecta y despejada", () => {
    const score = calculateSkyVisibility(
      { cloud: 0, visKm: 10, precipMm: 0, chanceOfRain: 0, humidity: 40, isDay: 0 },
      { isSunUp: 0, isMoonUp: 0, moonIllumination: 0 },
    );
    expect(score).toBe(100);
  });

  it("penaliza fuerte la nubosidad total", () => {
    const score = calculateSkyVisibility(
      { cloud: 100, visKm: 10, precipMm: 0, chanceOfRain: 0, humidity: 40, isDay: 0 },
      { isSunUp: 0, isMoonUp: 0, moonIllumination: 0 },
    );
    expect(score).toBe(35);
  });

  it("penaliza la lluvia activa más que la probabilidad de lluvia", () => {
    const raining = calculateSkyVisibility(
      { cloud: 20, visKm: 10, precipMm: 2, chanceOfRain: 90, humidity: 60, isDay: 0 },
      null,
    );
    const mightRain = calculateSkyVisibility(
      { cloud: 20, visKm: 10, precipMm: 0, chanceOfRain: 90, humidity: 60, isDay: 0 },
      null,
    );
    expect(raining).toBeLessThan(mightRain);
  });

  it("capa el score a 45 si es de día", () => {
    const score = calculateSkyVisibility(
      { cloud: 0, visKm: 10, precipMm: 0, chanceOfRain: 0, humidity: 30, isDay: 1 },
      { isSunUp: 1, isMoonUp: 0, moonIllumination: 0 },
    );
    expect(score).toBeLessThanOrEqual(45);
  });

  it("resta por Luna llena en el cielo", () => {
    const withMoon = calculateSkyVisibility(
      { cloud: 0, visKm: 10, precipMm: 0, chanceOfRain: 0, humidity: 30, isDay: 0 },
      { isSunUp: 0, isMoonUp: 1, moonIllumination: 95 },
    );
    expect(withMoon).toBe(92);
  });

  it("acepta moon_illumination como string (formato WeatherAPI)", () => {
    const score = calculateSkyVisibility(
      { cloud: 0, visKm: 10, isDay: 0 },
      { isSunUp: 0, isMoonUp: 1, moonIllumination: "95" },
    );
    expect(score).toBe(92);
  });

  it("nunca sale del rango 0-100", () => {
    const worst = calculateSkyVisibility(
      { cloud: 100, visKm: 0.5, precipMm: 10, chanceOfRain: 100, humidity: 100, isDay: 0 },
      { isSunUp: 0, isMoonUp: 1, moonIllumination: 100 },
    );
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);
  });

  it("usa defaults seguros cuando faltan datos", () => {
    expect(calculateSkyVisibility({}, null)).toBe(100);
  });
});

describe("getSkyVisibilityLabel", () => {
  it.each([
    [90, "Excelente"],
    [85, "Excelente"],
    [70, "Muy buena"],
    [55, "Buena"],
    [40, "Regular"],
    [20, "Mala"],
    [10, "Muy mala"],
  ])("score %i → %s", (score, label) => {
    expect(getSkyVisibilityLabel(score)).toBe(label);
  });

  it("todas las etiquetas tienen mensaje", () => {
    for (const score of [90, 75, 60, 45, 25, 5]) {
      expect(getSkyVisibilityMessage(score)).toBeTruthy();
    }
  });
});

describe("calculateISSObservationScore", () => {
  const nightAstro = { isSunUp: 0, isMoonUp: 0, moonIllumination: 0 };
  const nightHour = { isDay: 0 };

  it("pasada perfecta de noche con cielo perfecto ≈ 100", () => {
    const score = calculateISSObservationScore(
      { maxElevation: 90, durationMinutes: 7 },
      100,
      nightAstro,
      nightHour,
    );
    expect(score).toBe(100);
  });

  it("pondera el cielo al 60%", () => {
    const clear = calculateISSObservationScore(
      { maxElevation: 45, durationMinutes: 5 },
      100,
      nightAstro,
      nightHour,
    );
    const cloudy = calculateISSObservationScore(
      { maxElevation: 45, durationMinutes: 5 },
      0,
      nightAstro,
      nightHour,
    );
    expect(clear - cloudy).toBe(60);
  });

  it("penaliza pasadas diurnas", () => {
    const night = calculateISSObservationScore(
      { maxElevation: 60, durationMinutes: 5 },
      80,
      nightAstro,
      nightHour,
    );
    const day = calculateISSObservationScore(
      { maxElevation: 60, durationMinutes: 5 },
      80,
      { ...nightAstro, isSunUp: 1 },
      { isDay: 1 },
    );
    expect(day).toBeLessThan(night);
  });

  it("queda dentro de 0-100", () => {
    const score = calculateISSObservationScore(
      { maxElevation: 200, durationMinutes: 60 },
      100,
      nightAstro,
      nightHour,
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("calculateGeometryOnlyScore", () => {
  it("premia pasadas altas, largas y visibles", () => {
    const good = calculateGeometryOnlyScore({
      maxElevation: 80,
      durationMinutes: 6,
      isVisible: true,
    });
    const bad = calculateGeometryOnlyScore({
      maxElevation: 12,
      durationMinutes: 2,
      isVisible: false,
    });
    expect(good).toBeGreaterThan(70);
    expect(bad).toBeLessThan(25);
  });
});

describe("buildRecommendation", () => {
  it("avisa cuando la pasada no es visible", () => {
    const text = buildRecommendation({ maxElevation: 50, isVisible: false }, 90, 80);
    expect(text).toMatch(/no será visible/i);
  });

  it("recomienda salir antes en condiciones excelentes", () => {
    const text = buildRecommendation({ maxElevation: 70, isVisible: true }, 90, 85, {
      cloud: 5,
      chanceOfRain: 0,
    });
    expect(text).toMatch(/salí 5 minutos antes/i);
  });

  it("menciona la falta de clima cuando no hay datos", () => {
    const text = buildRecommendation({ maxElevation: 70, isVisible: true }, null, 75);
    expect(text).toMatch(/api de clima/i);
  });
});

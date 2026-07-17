import { describe, expect, it } from "vitest";
import {
  azimuthToCompass,
  compassLongName,
  formatCoords,
  haversineKm,
  isValidLat,
  isValidLon,
  normalizeLon,
} from "@/lib/geo";
import { latSchema, lonSchema, searchQuerySchema } from "@/schemas";

describe("validación de coordenadas", () => {
  it("acepta latitudes válidas y rechaza inválidas", () => {
    expect(isValidLat(-34.6)).toBe(true);
    expect(isValidLat(90)).toBe(true);
    expect(isValidLat(-91)).toBe(false);
    expect(isValidLat(NaN)).toBe(false);
  });

  it("acepta longitudes válidas y rechaza inválidas", () => {
    expect(isValidLon(-58.38)).toBe(true);
    expect(isValidLon(180)).toBe(true);
    expect(isValidLon(181)).toBe(false);
    expect(isValidLon(Infinity)).toBe(false);
  });

  it("los schemas Zod coercionan strings de query y validan rangos", () => {
    expect(latSchema.parse("-34.6037")).toBeCloseTo(-34.6037);
    expect(lonSchema.parse("-58.3816")).toBeCloseTo(-58.3816);
    expect(latSchema.safeParse("95").success).toBe(false);
    expect(lonSchema.safeParse("abc").success).toBe(false);
  });

  it("la búsqueda sanitiza caracteres peligrosos", () => {
    expect(searchQuerySchema.safeParse({ q: "Buenos Aires" }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "São Paulo" }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "<script>alert(1)</script>" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });
});

describe("normalizeLon", () => {
  it("normaliza a [-180, 180]", () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-190)).toBe(170);
    expect(normalizeLon(360)).toBe(0);
    expect(normalizeLon(45)).toBe(45);
  });
});

describe("azimuthToCompass", () => {
  it.each([
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SO"],
    [270, "O"],
    [315, "NO"],
    [359, "N"],
  ])("azimut %i° → %s", (az, expected) => {
    expect(azimuthToCompass(az)).toBe(expected);
  });

  it("tiene nombre largo en español", () => {
    expect(compassLongName("SO")).toBe("Suroeste");
    expect(compassLongName("NE")).toBe("Noreste");
  });
});

describe("haversineKm", () => {
  it("distancia Buenos Aires - Montevideo ≈ 205 km", () => {
    const bsas = { lat: -34.6037, lon: -58.3816 };
    const mvd = { lat: -34.9011, lon: -56.1645 };
    const d = haversineKm(bsas, mvd);
    expect(d).toBeGreaterThan(190);
    expect(d).toBeLessThan(220);
  });
});

describe("formatCoords", () => {
  it("formatea con hemisferios en español", () => {
    expect(formatCoords(-34.6037, -58.3816, 2)).toBe("34.60° S, 58.38° O");
    expect(formatCoords(48.85, 2.35, 1)).toBe("48.9° N, 2.4° E");
  });
});

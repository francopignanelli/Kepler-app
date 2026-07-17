import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDuration,
  formatRelativeDay,
  formatTime,
  toEpochSeconds,
} from "@/lib/time";

describe("formatTime (conversión a zona local)", () => {
  // 2026-07-07T23:43:00Z = 20:43 en Buenos Aires (UTC-3)
  const utc = "2026-07-07T23:43:00.000Z";

  it("convierte UTC a hora de Buenos Aires", () => {
    expect(formatTime(utc, "America/Argentina/Buenos_Aires")).toBe("20:43");
  });

  it("convierte UTC a hora de Tokio", () => {
    expect(formatTime(utc, "Asia/Tokyo")).toBe("08:43");
  });

  it("cae a UTC ante timezone inválida sin lanzar", () => {
    expect(formatTime(utc, "Zona/Inexistente")).toBe("23:43");
    expect(formatTime(utc, null)).toBe("23:43");
  });
});

describe("formatRelativeDay", () => {
  const now = new Date("2026-07-07T15:00:00.000Z");

  it("detecta hoy y mañana en la zona del observador", () => {
    expect(
      formatRelativeDay("2026-07-07T20:00:00.000Z", "America/Argentina/Buenos_Aires", now),
    ).toBe("hoy");
    expect(
      formatRelativeDay("2026-07-08T20:00:00.000Z", "America/Argentina/Buenos_Aires", now),
    ).toBe("mañana");
  });

  it("un horario UTC nocturno puede ser 'hoy' en la zona local", () => {
    // 2026-07-08T01:00Z = 2026-07-07 22:00 en Buenos Aires → sigue siendo "hoy"
    expect(
      formatRelativeDay("2026-07-08T01:00:00.000Z", "America/Argentina/Buenos_Aires", now),
    ).toBe("hoy");
  });
});

describe("formatDuration", () => {
  it("formatea segundos, minutos y combinaciones", () => {
    expect(formatDuration(40)).toBe("40 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(340)).toBe("5 min 40 s");
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  it("cuenta regresiva legible", () => {
    expect(formatCountdown("2026-07-07T12:45:00.000Z", now)).toBe("en 45 min");
    expect(formatCountdown("2026-07-07T14:15:00.000Z", now)).toBe("en 2 h 15 min");
    expect(formatCountdown("2026-07-09T13:00:00.000Z", now)).toBe("en 2 d 1 h");
    expect(formatCountdown("2026-07-07T11:00:00.000Z", now)).toBe("ahora");
  });
});

describe("toEpochSeconds", () => {
  it("convierte ISO a epoch en segundos", () => {
    expect(toEpochSeconds("2026-07-07T00:00:00.000Z")).toBe(1783382400);
  });
});

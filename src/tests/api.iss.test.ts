import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/lib/cache";
import { rateLimitClear } from "@/lib/rateLimit";

const TLE_TEXT = `ISS (ZARYA)
1 25544U 98067A   24325.54761574  .00018705  00000+0  33390-3 0  9994
2 25544  51.6398 300.3489 0007209  56.5906  47.3234 15.50067047483466`;

const wtiPosition = {
  name: "iss",
  id: 25544,
  latitude: -30.12,
  longitude: 100.55,
  altitude: 421.3,
  velocity: 27544.8,
  visibility: "eclipsed",
  timestamp: 1732107000,
};

describe("GET /api/iss/position", () => {
  beforeEach(() => {
    cacheClear();
    rateLimitClear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mapea la posición de WhereTheISS.at a la forma propia", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(wtiPosition), { status: 200 })),
    );

    const { GET } = await import("@/app/api/iss/position/route");
    const response = await GET(new Request("http://localhost/api/iss/position"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.noradId).toBe(25544);
    expect(body.lat).toBe(-30.12);
    expect(body.lon).toBe(100.55);
    expect(body.altitudeKm).toBe(421.3);
    expect(body.visibility).toBe("eclipsed");
    expect(body.source).toBe("wheretheiss");
    expect(body.timestamp).toBe(1732107000 * 1000);
  });

  it("degrada a SGP4 local si la fuente de posición en vivo falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const href = String(url);
        if (href.includes("wheretheiss.at/v1/satellites/25544?")) {
          return new Response("service down", { status: 503 });
        }
        if (href.includes("celestrak.org")) {
          return new Response(TLE_TEXT, { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const { GET } = await import("@/app/api/iss/position/route");
    const response = await GET(new Request("http://localhost/api/iss/position"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("sgp4");
    expect(Math.abs(body.lat)).toBeLessThanOrEqual(53);
    expect(Number.isFinite(body.altitudeKm)).toBe(true);
  });

  it("devuelve 502 si todas las fuentes fallan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );

    const { GET } = await import("@/app/api/iss/position/route");
    const response = await GET(new Request("http://localhost/api/iss/position"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe("UPSTREAM_ERROR");
  });
});

describe("GET /api/iss/track", () => {
  beforeEach(() => {
    cacheClear();
    rateLimitClear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("genera la trayectoria pasada y futura desde el TLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes("celestrak.org")
          ? new Response(TLE_TEXT, { status: 200 })
          : new Response("not found", { status: 404 }),
      ),
    );

    const { GET } = await import("@/app/api/iss/track/route");
    const response = await GET(
      new Request("http://localhost/api/iss/track?pastMin=30&futureMin=30&stepSec=60"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.past.length).toBeGreaterThan(10);
    expect(body.future.length).toBeGreaterThan(10);
    expect(body.past[0]).toHaveProperty("lat");
    expect(body.past[0]).toHaveProperty("lon");
    expect(body.past[0]).toHaveProperty("altitudeKm");
  });

  it("valida los parámetros del track", async () => {
    const { GET } = await import("@/app/api/iss/track/route");
    const response = await GET(
      new Request("http://localhost/api/iss/track?pastMin=99999&futureMin=30&stepSec=60"),
    );
    expect(response.status).toBe(400);
  });
});
